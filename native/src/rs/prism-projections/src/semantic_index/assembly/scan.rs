//! The quote-aware S-expression scanner for catalog forms, a port of
//! `backend/app/services/variant_source_scan.py` (the whole module).
//!
//! Quoted spans are masked once, retaining byte offsets; C-level searches and
//! counts skip large numeric board payloads; only variant and sheet-link forms
//! are visited. Quoted strings and escaped quotes never confuse the form walk,
//! and an unreadable or unbalanced source is reported, never guessed at.

/// `SourceRecords` (`variant_source_scan.py:23-29`): what one source file said.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(super) struct SourceRecords {
    /// `(name, description)` of each board `(variants …)` header variant.
    pub header: Vec<(String, Option<String>)>,
    /// Variant names, in file order.
    pub names: Vec<String>,
    /// `Sheetfile` property values of `(sheet …)` forms, in file order.
    pub sheets: Vec<String>,
    /// False when the text is not one balanced KiCad root form.
    pub readable: bool,
}

impl SourceRecords {
    /// The fast path (`variant_source_scan.py:44-45`): readable, nothing found.
    fn empty() -> Self {
        Self {
            readable: true,
            ..Self::default()
        }
    }

    /// `scan_source`'s `except (ValueError, IndexError)` result (:48-49).
    fn unreadable() -> Self {
        Self::default()
    }
}

/// `scan_source(text, root)` (`variant_source_scan.py:40-49`): the catalog
/// forms of one board (`root` = `"kicad_pcb"`) or schematic (`"kicad_sch"`).
pub(super) fn scan(text: &str, root: &str) -> SourceRecords {
    // Metadata discovery, not whole-file validation: without variant forms or
    // possible sheet links there is nothing to extract.
    if !has_relevant_form(text) && (root != "kicad_sch" || !text.contains("Sheetfile")) {
        return SourceRecords::empty();
    }
    scan_structural(text, root).unwrap_or_else(SourceRecords::unreadable)
}

/// The `_scan_source` body (`variant_source_scan.py:52-122`); `None` is any
/// `ValueError`/`IndexError` the walk raises there.
fn scan_structural(text: &str, root: &str) -> Option<SourceRecords> {
    let (mask, malformed) = mask_strings(text);
    if malformed || !starts_root(&mask, root) || !balanced_root(&mask) {
        return None;
    }
    let root_end = mask.iter().rposition(|&byte| byte == b')')? + 1;
    if !text[root_end..].chars().all(is_python_space) {
        return None;
    }

    let mut walk = Walk {
        text,
        mask: &mask,
        root,
        records: SourceRecords::empty(),
        parents: Vec::new(),
    };
    let mut depth: i64 = 0;
    let mut offset = 0;
    for form in find_forms(&mask) {
        for &byte in &mask[offset..form.start] {
            match byte {
                b'(' => depth += 1,
                b')' => depth -= 1,
                _ => {}
            }
        }
        while walk.parents.last().is_some_and(|(at, _)| *at >= depth) {
            walk.parents.pop();
        }
        let parent = walk
            .parents
            .last()
            .filter(|(at, _)| *at == depth - 1)
            .map(|(_, tag)| *tag);
        walk.visit(&form, depth, parent)?;
        walk.parents.push((depth, form.tag));
        depth += 1;
        offset = form.tag_end;
    }
    Some(walk.records)
}

/// The state of one `_scan_source` walk (`variant_source_scan.py:78-122`).
struct Walk<'a> {
    text: &'a str,
    mask: &'a [u8],
    root: &'a str,
    records: SourceRecords,
    /// Open recognized forms, innermost last, as `(depth, tag)`.
    parents: Vec<(i64, Tag)>,
}

impl Walk<'_> {
    /// Handle one `_FORMS` match (`variant_source_scan.py:84-119`).
    fn visit(&mut self, form: &Form, depth: i64, parent: Option<Tag>) -> Option<()> {
        match form.tag {
            Tag::Variant => self.visit_variant(form, depth, parent)?,
            Tag::Property if parent == Some(Tag::Sheet) => {
                if let Some((key, value)) = property_pair(self.text, form.start)
                    && json_string(key)? == "Sheetfile"
                {
                    self.records.sheets.push(json_string(value)?);
                }
            }
            _ => {}
        }
        Some(())
    }

    /// A `(variant …)` header or instance record (`variant_source_scan.py:90-114`).
    fn visit_variant(&mut self, form: &Form, depth: i64, parent: Option<Tag>) -> Option<()> {
        let is_header = self.root == "kicad_pcb" && parent == Some(Tag::Variants) && depth == 2;
        let is_record = (self.root == "kicad_pcb" && parent == Some(Tag::Footprint))
            || (self.root == "kicad_sch"
                && parent == Some(Tag::Path)
                && self.parents.iter().any(|(_, tag)| *tag == Tag::Instances));
        if !is_header && !is_record {
            return Some(());
        }
        let end = end_of_form(self.mask, form.start)?;
        let (name, description) = variant_fields(self.text, self.mask, form.tag_end, end)?;
        let Some(name) = name.filter(|name| !name.is_empty() && name != "< Default >") else {
            return Some(());
        };
        if is_header {
            self.records.header.push((name, description));
        } else {
            self.records.names.push(name);
        }
        Some(())
    }
}

/// The `(name …)`/`(description …)` fields of one variant record
/// (`variant_source_scan.py:96-114`); `None` is a JSON error there.
fn variant_fields(
    text: &str,
    mask: &[u8],
    mut position: usize,
    end: usize,
) -> Option<(Option<String>, Option<String>)> {
    let mut name = None;
    let mut description = None;
    while position < end {
        let Some(start) = find_byte(mask, b'(', position, end) else {
            break;
        };
        let stop = end_of_form(mask, start)?;
        if let Some((key, token)) = name_form(&text[start..stop]) {
            let value = json_string(token)?;
            match key {
                "name" => name = Some(value),
                "description" => description = Some(value),
                _ => {}
            }
        }
        position = stop;
    }
    Some((name, description))
}

/// The `_NAME` form (`variant_source_scan.py:19`): `(name "…")` or
/// `(description "…")` exactly, returning `(key, quoted token)`.
fn name_form(slice: &str) -> Option<(&str, &str)> {
    let bytes = slice.as_bytes();
    if bytes.first() != Some(&b'(') {
        return None;
    }
    let mut at = 1;
    while at < bytes.len() && space_len(bytes, at) > 0 {
        at += space_len(bytes, at);
    }
    let key = if starts_word(bytes, at, b"name") {
        at += "name".len();
        "name"
    } else if starts_word(bytes, at, b"description") {
        at += "description".len();
        "description"
    } else {
        return None;
    };
    if at >= bytes.len() || space_len(bytes, at) == 0 {
        return None;
    }
    while at < bytes.len() && space_len(bytes, at) > 0 {
        at += space_len(bytes, at);
    }
    let token_start = at;
    let token_end = match_quoted(bytes, at)?;
    let mut after = token_end;
    while after < bytes.len() && space_len(bytes, after) > 0 {
        after += space_len(bytes, after);
    }
    if after + 1 != bytes.len() || bytes[after] != b')' {
        return None;
    }
    Some((key, &slice[token_start..token_end]))
}

/// The `_PROPERTY` form (`variant_source_scan.py:20`): `(property "…" "…")`,
/// returning the two quoted tokens.
fn property_pair(text: &str, start: usize) -> Option<(&str, &str)> {
    let bytes = text.as_bytes();
    if start >= bytes.len() || bytes[start] != b'(' {
        return None;
    }
    let mut at = start + 1;
    while at < bytes.len() && space_len(bytes, at) > 0 {
        at += space_len(bytes, at);
    }
    if !starts_word(bytes, at, b"property") {
        return None;
    }
    at += "property".len();
    if at >= bytes.len() || space_len(bytes, at) == 0 {
        return None;
    }
    while at < bytes.len() && space_len(bytes, at) > 0 {
        at += space_len(bytes, at);
    }
    let key_start = at;
    let key_end = match_quoted(bytes, at)?;
    at = key_end;
    if at >= bytes.len() || space_len(bytes, at) == 0 {
        return None;
    }
    while at < bytes.len() && space_len(bytes, at) > 0 {
        at += space_len(bytes, at);
    }
    let value_start = at;
    let value_end = match_quoted(bytes, at)?;
    Some((&text[key_start..key_end], &text[value_start..value_end]))
}

/// `json.loads` on a quoted token (`variant_source_scan.py:107`, `:117-118`).
fn json_string(token: &str) -> Option<String> {
    serde_json::from_str(token).ok()
}

/// `_PARENS` form end (`variant_source_scan.py:31-37`), `None` for unbalanced.
fn end_of_form(mask: &[u8], start: usize) -> Option<usize> {
    let mut depth = 0i64;
    for (index, &byte) in mask.iter().enumerate().skip(start) {
        match byte {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(index + 1);
                }
            }
            _ => {}
        }
    }
    None
}

/// One `_FORMS` match (`variant_source_scan.py:18`).
struct Form {
    start: usize,
    tag_end: usize,
    tag: Tag,
}

/// A `_FORMS` alternative (`variant_source_scan.py:18`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Tag {
    KicadPcb,
    KicadSch,
    Footprint,
    Symbol,
    Sheet,
    Instances,
    Project,
    Path,
    Variants,
    Variant,
    Property,
}

/// `_FORMS.finditer(mask)` (`variant_source_scan.py:84`).
fn find_forms(mask: &[u8]) -> Vec<Form> {
    let mut forms = Vec::new();
    let mut at = 0;
    while at < mask.len() {
        if mask[at] == b'(' {
            let mut word = at + 1;
            while word < mask.len() && space_len(mask, word) > 0 {
                word += space_len(mask, word);
            }
            if let Some((tag, tag_end)) = match_tag(mask, word) {
                forms.push(Form {
                    start: at,
                    tag_end,
                    tag,
                });
                at = tag_end;
                continue;
            }
        }
        at += 1;
    }
    forms
}

/// The `_FORMS` alternation, in order, with its `(?=\s|\))` lookahead.
fn match_tag(mask: &[u8], at: usize) -> Option<(Tag, usize)> {
    const TAGS: [(&[u8], Tag); 11] = [
        (b"kicad_pcb", Tag::KicadPcb),
        (b"kicad_sch", Tag::KicadSch),
        (b"footprint", Tag::Footprint),
        (b"symbol", Tag::Symbol),
        (b"sheet", Tag::Sheet),
        (b"instances", Tag::Instances),
        (b"project", Tag::Project),
        (b"path", Tag::Path),
        (b"variants", Tag::Variants),
        (b"variant", Tag::Variant),
        (b"property", Tag::Property),
    ];
    for (word, tag) in TAGS {
        if starts_word(mask, at, word) {
            let end = at + word.len();
            if end >= mask.len() || space_len(mask, end) > 0 || mask[end] == b')' {
                return Some((tag, end));
            }
        }
    }
    None
}

/// `_RELEVANT.search(text)` (`variant_source_scan.py:16`, `:44`).
fn has_relevant_form(text: &str) -> bool {
    let bytes = text.as_bytes();
    for (at, &byte) in bytes.iter().enumerate() {
        if byte != b'(' {
            continue;
        }
        let mut word = at + 1;
        while word < bytes.len() && space_len(bytes, word) > 0 {
            word += space_len(bytes, word);
        }
        if !starts_word(bytes, word, b"variant") {
            continue;
        }
        let mut end = word + "variant".len();
        if end < bytes.len() && bytes[end] == b's' {
            end += 1;
        }
        if end >= bytes.len() || space_len(bytes, end) > 0 || bytes[end] == b')' {
            return true;
        }
    }
    false
}

/// Mask every quoted span (`variant_source_scan.py:54-61`), returning the mask
/// and whether any string was unterminated. Every masked byte becomes a space,
/// so byte offsets still name the same source positions.
fn mask_strings(text: &str) -> (Vec<u8>, bool) {
    let bytes = text.as_bytes();
    let mut mask = bytes.to_vec();
    let mut malformed = false;
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'"'
            && let Some(end) = match_string(bytes, at)
        {
            for byte in &mut mask[at..end] {
                *byte = b' ';
            }
            if bytes[end - 1] != b'"' || end - at == 1 {
                malformed = true;
            }
            at = end;
            continue;
        }
        at += 1;
    }
    (mask, malformed)
}

/// The `_STRINGS` match at `at` (`variant_source_scan.py:12`), end-exclusive;
/// Python's `(?:"|$)` lets an unterminated string run to the end of the text.
fn match_string(bytes: &[u8], at: usize) -> Option<usize> {
    let mut index = at + 1;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => return Some(index + 1),
            b'\\' => {
                if index + 1 < bytes.len() && bytes[index + 1] != b'\n' {
                    index += 2;
                } else {
                    return None;
                }
            }
            _ => index += 1,
        }
    }
    Some(bytes.len())
}

/// A quoted token that must be terminated (`_NAME`/`_PROPERTY` groups).
fn match_quoted(bytes: &[u8], at: usize) -> Option<usize> {
    if bytes.get(at) != Some(&b'"') {
        return None;
    }
    let mut index = at + 1;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => return Some(index + 1),
            b'\\' => {
                if index + 1 < bytes.len() && bytes[index + 1] != b'\n' {
                    index += 2;
                } else {
                    return None;
                }
            }
            _ => index += 1,
        }
    }
    None
}

/// `\s*\(\s*ROOT(?=\s|\))` at the start of the mask (:62).
fn starts_root(mask: &[u8], root: &str) -> bool {
    let mut at = 0;
    while at < mask.len() && space_len(mask, at) > 0 {
        at += space_len(mask, at);
    }
    if at >= mask.len() || mask[at] != b'(' {
        return false;
    }
    at += 1;
    while at < mask.len() && space_len(mask, at) > 0 {
        at += space_len(mask, at);
    }
    if !starts_word(mask, at, root.as_bytes()) {
        return false;
    }
    let end = at + root.len();
    end >= mask.len() || space_len(mask, end) > 0 || mask[end] == b')'
}

/// The `_PARENS` balance/one-root check (`variant_source_scan.py:64-73`).
fn balanced_root(mask: &[u8]) -> bool {
    let mut depth = 0i64;
    let mut roots = 0;
    for &byte in mask {
        match byte {
            b'(' => depth += 1,
            b')' => depth -= 1,
            _ => continue,
        }
        if depth == 0 {
            roots += 1;
        }
        if depth < 0 {
            return false;
        }
    }
    depth == 0 && roots == 1
}

/// `mask.find(byte, from, to)` (Python `str.find`).
fn find_byte(mask: &[u8], byte: u8, from: usize, to: usize) -> Option<usize> {
    mask.get(from..to)?
        .iter()
        .position(|&it| it == byte)
        .map(|at| from + at)
}

/// `bytes[at..].starts_with(word)` without an index panic.
fn starts_word(bytes: &[u8], at: usize, word: &[u8]) -> bool {
    bytes.len() >= at + word.len() && &bytes[at..at + word.len()] == word
}

/// The byte length of the `\s` character at `at`, or 0 (also 0 past the end
/// or inside a UTF-8 sequence). The mask keeps every unmasked byte, and masks
/// whole strings with ASCII spaces, so it stays valid UTF-8.
fn space_len(bytes: &[u8], at: usize) -> usize {
    let Some(&lead) = bytes.get(at) else {
        return 0;
    };
    if lead.is_ascii() {
        return usize::from(is_python_space(char::from(lead)));
    }
    let width = match lead {
        0xc0..=0xdf => 2,
        0xe0..=0xef => 3,
        _ => 4,
    };
    bytes
        .get(at..at + width)
        .and_then(|slice| std::str::from_utf8(slice).ok())
        .and_then(|text| text.chars().next())
        .filter(|&character| is_python_space(character))
        .map_or(0, char::len_utf8)
}

/// Python's `str.isspace()`, which `\s` and `str.strip()` use on `str`:
/// Unicode `White_Space` plus the four information separators U+001C-U+001F.
fn is_python_space(character: char) -> bool {
    character.is_whitespace() || ('\u{1c}'..='\u{1f}').contains(&character)
}

#[cfg(test)]
mod tests {
    use super::scan;

    #[test]
    fn board_header_and_footprint_records() {
        let header = scan(
            "(kicad_pcb (variants (variant (name \"Lite\") (description \"Cost\"))))",
            "kicad_pcb",
        );
        assert!(header.readable);
        assert_eq!(
            header.header,
            vec![("Lite".to_owned(), Some("Cost".to_owned()))]
        );
        assert!(header.names.is_empty());

        let footprint = scan(
            "(kicad_pcb (footprint (variant (name \"LITE\"))))",
            "kicad_pcb",
        );
        assert!(footprint.readable);
        assert_eq!(footprint.names, vec!["LITE".to_owned()]);
    }

    #[test]
    fn schematic_instance_records_and_sheet_links() {
        let text = "(kicad_sch \
            (symbol (instances (project (path \"/\" (variant (name \"Lite\")))))) \
            (sheet (property \"Sheetfile\" \"sub.kicad_sch\")))";
        let records = scan(text, "kicad_sch");
        assert!(records.readable);
        assert_eq!(records.names, vec!["Lite".to_owned()]);
        assert_eq!(records.sheets, vec!["sub.kicad_sch".to_owned()]);
    }

    #[test]
    fn quoted_forms_do_not_confuse_the_walk() {
        // A `(variant` inside a quoted string is masked, not a record.
        let records = scan(
            "(kicad_pcb (property \"X\" \"(variant (name \\\"no\\\"))\"))",
            "kicad_pcb",
        );
        assert!(records.readable);
        assert!(records.header.is_empty());
        assert!(records.names.is_empty());
    }

    #[test]
    fn unrelated_and_unbalanced_sources() {
        assert_eq!(
            scan("(kicad_pcb (net 0 \"\"))", "kicad_pcb"),
            super::SourceRecords::empty()
        );
        assert!(!scan("(kicad_pcb (variants (variant (name \"x\")))", "kicad_pcb").readable);
    }

    #[test]
    fn a_property_without_a_quoted_value_is_skipped_not_unreadable() {
        // `_PROPERTY` simply does not match; the source stays readable.
        let records = scan(
            "(kicad_sch (sheet (property \"Sheetname\\x\" footprint\"x\") \
             (property \"Sheetfile\" \"a.kicad_sch\")))",
            "kicad_sch",
        );
        assert!(records.readable);
        assert_eq!(records.sheets, ["a.kicad_sch"]);
    }

    #[test]
    fn unicode_whitespace_is_python_whitespace() {
        let records = scan(
            "(kicad_pcb (variants (\u{a0}variant (name\u{3000}\"A\") (description \"d\"\u{1f}))))",
            "kicad_pcb",
        );
        assert_eq!(records.header, [("A".to_owned(), Some("d".to_owned()))]);
    }
}
