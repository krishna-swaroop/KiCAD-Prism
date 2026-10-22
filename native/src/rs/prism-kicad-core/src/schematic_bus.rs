//! Bounded KiCad schematic bus-label parsing and expansion.

mod contract;

pub use contract::{
    SchematicBusExpansionError, SchematicBusExpansionErrorKind, SchematicBusExpansionLimits,
    SchematicBusPattern, canonical_bus_member_name,
};

use std::borrow::Borrow;
use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasher, Hash};

pub fn parse_schematic_bus_vector(
    text: &str,
    limits: SchematicBusExpansionLimits,
) -> Result<Option<SchematicBusPattern>, SchematicBusExpansionError> {
    check_input(text, limits)?;
    let Some(vector) = parse_vector_syntax(text) else {
        return Ok(None);
    };
    let count = vector_member_count(&vector)?;
    if count > limits.max_expanded_members {
        return Err(resource_error("bus vector member count exceeds its limit"));
    }
    let expected_bytes = vector_member_bytes(&vector)?;
    if expected_bytes > limits.max_parsed_member_bytes {
        return Err(resource_error("bus member bytes exceed their limit"));
    }
    let mut members = Vec::new();
    members
        .try_reserve_exact(count)
        .map_err(|_| resource_error("bus vector member allocation failed"))?;
    let mut retained_bytes = 0_usize;
    for index in vector.begin..=vector.end {
        let member = format!("{}{}{}", vector.prefix, index, vector.suffix);
        push_bounded(
            &mut members,
            &mut retained_bytes,
            member,
            limits.max_expanded_members,
            limits.max_parsed_member_bytes,
        )?;
    }
    Ok(Some(SchematicBusPattern {
        prefix: vector.prefix,
        members,
    }))
}

fn vector_member_count(vector: &VectorSyntax) -> Result<usize, SchematicBusExpansionError> {
    let count = vector
        .end
        .checked_sub(vector.begin)
        .and_then(|distance| distance.checked_add(1))
        .ok_or_else(|| resource_error("bus vector member count overflowed"))?;
    usize::try_from(count).map_err(|_| resource_error("bus vector member count exceeds usize"))
}

fn vector_member_bytes(vector: &VectorSyntax) -> Result<usize, SchematicBusExpansionError> {
    let fixed = vector
        .prefix
        .len()
        .checked_add(vector.suffix.len())
        .ok_or_else(|| resource_error("bus vector member bytes overflowed"))?;
    (vector.begin..=vector.end).try_fold(0_usize, |total, index| {
        total
            .checked_add(fixed)
            .and_then(|value| value.checked_add(decimal_digits(index)))
            .ok_or_else(|| resource_error("bus vector member bytes overflowed"))
    })
}

fn decimal_digits(mut value: u32) -> usize {
    let mut digits = 1_usize;
    while value >= 10 {
        value /= 10;
        digits += 1;
    }
    digits
}

pub fn parse_schematic_bus_group(
    text: &str,
    limits: SchematicBusExpansionLimits,
) -> Result<Option<SchematicBusPattern>, SchematicBusExpansionError> {
    check_input(text, limits)?;
    parse_group_syntax(text, limits, true)
}

pub fn is_schematic_bus_label(
    text: &str,
    limits: SchematicBusExpansionLimits,
) -> Result<bool, SchematicBusExpansionError> {
    check_input(text, limits)?;
    if parse_vector_syntax(text).is_some() {
        return Ok(true);
    }
    Ok(parse_group_syntax(text, limits, false)?.is_some())
}

/// Expand vector, group, and alias bus expressions without recursive calls.
pub fn expand_schematic_bus_label(
    text: &str,
    aliases: &HashMap<String, Vec<String>>,
    limits: SchematicBusExpansionLimits,
) -> Result<Vec<String>, SchematicBusExpansionError> {
    expand_schematic_bus_label_from_map(text, aliases, limits)
}

pub(crate) fn expand_schematic_bus_label_from_map<K, V, S>(
    text: &str,
    aliases: &HashMap<K, V, S>,
    limits: SchematicBusExpansionLimits,
) -> Result<Vec<String>, SchematicBusExpansionError>
where
    K: Borrow<str> + Eq + Hash,
    V: AsRef<[String]>,
    S: BuildHasher,
{
    check_input(text, limits)?;
    ExpansionState {
        aliases,
        limits,
        output: Vec::new(),
        output_bytes: 0,
        active_aliases: HashSet::new(),
        work_bytes: 0,
        stack: Vec::new(),
    }
    .run(text)
}

struct ExpansionState<'a, K, V, S> {
    aliases: &'a HashMap<K, V, S>,
    limits: SchematicBusExpansionLimits,
    output: Vec<String>,
    output_bytes: usize,
    active_aliases: HashSet<&'a str>,
    work_bytes: usize,
    stack: Vec<ExpansionTask<'a>>,
}

impl<'a, K, V, S> ExpansionState<'a, K, V, S>
where
    K: Borrow<str> + Eq + Hash,
    V: AsRef<[String]>,
    S: BuildHasher,
{
    fn run(mut self, text: &str) -> Result<Vec<String>, SchematicBusExpansionError> {
        self.push_borrowed_expand(text, "", 0)?;
        while let Some(task) = self.stack.pop() {
            self.work_bytes = self.work_bytes.saturating_sub(task.retained_bytes());
            match task {
                ExpansionTask::LeaveAlias(alias) => {
                    self.active_aliases.remove(alias);
                }
                ExpansionTask::Expand {
                    text,
                    qualifier,
                    depth,
                    alias_member,
                } => self.expand(text, qualifier, depth, alias_member)?,
            }
        }
        Ok(self.output)
    }

    fn expand(
        &mut self,
        text: String,
        qualifier: String,
        depth: usize,
        alias_member: bool,
    ) -> Result<(), SchematicBusExpansionError> {
        if depth > self.limits.max_nesting_depth {
            return Err(resource_error("bus expansion nesting exceeds its limit"));
        }
        check_input(&text, self.limits)?;
        // An alias's own members are signal names, never further aliases: KiCad
        // 10 reads `FAN_TACH: [FAN_TACH, FAN2_TACH]` as the signal FAN_TACH and
        // leaves a member naming another alias unexpanded (a cycle included).
        let alias = if alias_member {
            None
        } else {
            self.aliases.get_key_value(text.as_str())
        };
        if let Some((alias_name, members)) = alias {
            let alias_name = alias_name.borrow();
            let members = members.as_ref();
            if members.is_empty() {
                return Ok(());
            }
            let child_depth = self.child_depth(depth)?;
            self.preflight_members(members, qualifier.len(), 1)?;
            if !self.active_aliases.insert(alias_name) {
                return Err(SchematicBusExpansionError {
                    kind: SchematicBusExpansionErrorKind::AliasCycle,
                    message: format!("bus alias cycle includes {text:?}"),
                });
            }
            self.push_task(ExpansionTask::LeaveAlias(alias_name))?;
            let mut qualifier = Some(qualifier);
            for (offset, member) in members.iter().rev().enumerate() {
                let child_qualifier = take_last_or_clone(&mut qualifier, offset, members.len())?;
                self.push_task(ExpansionTask::Expand {
                    text: member.clone(),
                    qualifier: child_qualifier,
                    depth: child_depth,
                    alias_member: true,
                })?;
            }
            return Ok(());
        }
        if let Some(vector) = parse_vector_syntax(&text) {
            return self.expand_vector(&vector, &qualifier);
        }
        if let Some(group) = parse_schematic_bus_group(&text, self.limits)? {
            let child_depth = self.child_depth(depth)?;
            let nested_length = joined_qualifier_length(&qualifier, &group.prefix)?;
            self.preflight_members(&group.members, nested_length, 0)?;
            let mut nested_qualifier = Some(join_qualifier(&qualifier, &group.prefix));
            let member_count = group.members.len();
            for (offset, member) in group.members.into_iter().rev().enumerate() {
                let child_qualifier =
                    take_last_or_clone(&mut nested_qualifier, offset, member_count)?;
                self.push_task(ExpansionTask::Expand {
                    text: member,
                    qualifier: child_qualifier,
                    depth: child_depth,
                    alias_member: false,
                })?;
            }
            return Ok(());
        }
        push_qualified_output(
            &mut self.output,
            &mut self.output_bytes,
            &qualifier,
            &text,
            self.limits,
        )
    }

    fn expand_vector(
        &mut self,
        vector: &VectorSyntax,
        qualifier: &str,
    ) -> Result<(), SchematicBusExpansionError> {
        let count = vector_member_count(vector)?;
        let next_count = self
            .output
            .len()
            .checked_add(count)
            .ok_or_else(|| resource_error("bus member count overflowed"))?;
        if next_count > self.limits.max_expanded_members {
            return Err(resource_error("bus member count exceeds its limit"));
        }
        let qualification_bytes = if qualifier.is_empty() {
            0
        } else {
            qualifier
                .len()
                .checked_add(1)
                .and_then(|length| length.checked_mul(count))
                .ok_or_else(|| resource_error("bus member bytes overflowed"))?
        };
        let additional_bytes = vector_member_bytes(vector)?
            .checked_add(qualification_bytes)
            .ok_or_else(|| resource_error("bus member bytes overflowed"))?;
        let next_bytes = self
            .output_bytes
            .checked_add(additional_bytes)
            .ok_or_else(|| resource_error("bus member bytes overflowed"))?;
        if next_bytes > self.limits.max_expanded_output_bytes {
            return Err(resource_error("bus member bytes exceed their limit"));
        }
        self.output
            .try_reserve(count)
            .map_err(|_| resource_error("bus member allocation failed"))?;
        for index in vector.begin..=vector.end {
            let member = format!("{}{}{}", vector.prefix, index, vector.suffix);
            self.output.push(qualify(qualifier, &member));
        }
        self.output_bytes = next_bytes;
        Ok(())
    }

    fn push_task(&mut self, task: ExpansionTask<'a>) -> Result<(), SchematicBusExpansionError> {
        push_task(&mut self.stack, &mut self.work_bytes, task, self.limits)
    }

    fn push_borrowed_expand(
        &mut self,
        text: &str,
        qualifier: &str,
        depth: usize,
    ) -> Result<(), SchematicBusExpansionError> {
        check_input(text, self.limits)?;
        let bytes = text
            .len()
            .checked_add(qualifier.len())
            .ok_or_else(|| resource_error("bus expansion work bytes overflowed"))?;
        self.preflight_work(1, bytes)?;
        self.push_task(ExpansionTask::Expand {
            text: text.to_owned(),
            qualifier: qualifier.to_owned(),
            depth,
            alias_member: false,
        })
    }

    fn preflight_members(
        &self,
        members: &[String],
        qualifier_bytes: usize,
        extra_items: usize,
    ) -> Result<(), SchematicBusExpansionError> {
        let additional_items = members
            .len()
            .checked_add(extra_items)
            .ok_or_else(|| resource_error("bus expansion work item count overflowed"))?;
        self.preflight_work_items(additional_items)?;
        let additional_bytes = members.iter().try_fold(0_usize, |total, member| {
            check_input(member, self.limits)?;
            total
                .checked_add(member.len())
                .and_then(|value| value.checked_add(qualifier_bytes))
                .ok_or_else(|| resource_error("bus expansion work bytes overflowed"))
        })?;
        self.preflight_work_bytes(additional_bytes)
    }

    fn preflight_work(
        &self,
        additional_items: usize,
        additional_bytes: usize,
    ) -> Result<(), SchematicBusExpansionError> {
        self.preflight_work_items(additional_items)?;
        self.preflight_work_bytes(additional_bytes)
    }

    fn preflight_work_items(
        &self,
        additional_items: usize,
    ) -> Result<(), SchematicBusExpansionError> {
        let next_items = self
            .stack
            .len()
            .checked_add(additional_items)
            .ok_or_else(|| resource_error("bus expansion work item count overflowed"))?;
        if next_items > self.limits.max_expansion_work_items {
            return Err(resource_error(
                "bus expansion work items exceed their limit",
            ));
        }
        Ok(())
    }

    fn preflight_work_bytes(
        &self,
        additional_bytes: usize,
    ) -> Result<(), SchematicBusExpansionError> {
        let next_bytes = self
            .work_bytes
            .checked_add(additional_bytes)
            .ok_or_else(|| resource_error("bus expansion work bytes overflowed"))?;
        if next_bytes > self.limits.max_expansion_work_bytes {
            return Err(resource_error(
                "bus expansion work bytes exceed their limit",
            ));
        }
        Ok(())
    }

    fn child_depth(&self, depth: usize) -> Result<usize, SchematicBusExpansionError> {
        let child = depth
            .checked_add(1)
            .ok_or_else(|| resource_error("bus expansion nesting overflowed"))?;
        if child > self.limits.max_nesting_depth {
            Err(resource_error("bus expansion nesting exceeds its limit"))
        } else {
            Ok(child)
        }
    }
}

fn take_last_or_clone(
    value: &mut Option<String>,
    offset: usize,
    count: usize,
) -> Result<String, SchematicBusExpansionError> {
    if offset + 1 == count {
        value
            .take()
            .ok_or_else(|| resource_error("bus expansion qualifier state is missing"))
    } else {
        value
            .as_ref()
            .cloned()
            .ok_or_else(|| resource_error("bus expansion qualifier state is missing"))
    }
}

#[derive(Debug)]
enum ExpansionTask<'a> {
    Expand {
        text: String,
        qualifier: String,
        depth: usize,
        alias_member: bool,
    },
    LeaveAlias(&'a str),
}

impl ExpansionTask<'_> {
    fn retained_bytes(&self) -> usize {
        match self {
            Self::Expand {
                text, qualifier, ..
            } => text.len().saturating_add(qualifier.len()),
            Self::LeaveAlias(_) => 0,
        }
    }
}

struct VectorSyntax {
    prefix: String,
    begin: u32,
    end: u32,
    suffix: String,
}

fn parse_vector_syntax(text: &str) -> Option<VectorSyntax> {
    let characters = text.chars().collect::<Vec<_>>();
    if characters.len() < 4 {
        return None;
    }
    let (prefix, mut index, mut brace_nesting, format_wraps_name) =
        parse_vector_prefix(&characters, text.len())?;
    index += 1;
    let begin = parse_index(&characters, &mut index, true)?;
    let end = parse_index(&characters, &mut index, false)?;
    let suffix = parse_vector_suffix(&characters, index, &mut brace_nesting, format_wraps_name)?;
    if brace_nesting != 0 || begin == end {
        return None;
    }
    let (begin, end) = if begin < end {
        (begin, end)
    } else {
        (end, begin)
    };
    Some(VectorSyntax {
        prefix,
        begin,
        end,
        suffix,
    })
}

fn parse_vector_prefix(characters: &[char], capacity: usize) -> Option<(String, usize, i64, bool)> {
    let mut prefix = String::with_capacity(capacity);
    let mut index = 0_usize;
    let mut brace_nesting = 0_i64;
    let mut format_wraps_name = false;
    let mut in_quotes = false;
    while index < characters.len() {
        if let Some(next) = consume_quoted_character(characters, index, &mut in_quotes, &mut prefix)
        {
            index = next;
            continue;
        }
        let action = vector_prefix_action(characters, index);
        if matches!(action, PrefixAction::EscapedSpace) {
            index += 1;
        }
        match apply_vector_prefix_action(
            action,
            &mut prefix,
            &mut brace_nesting,
            &mut format_wraps_name,
        ) {
            ScanControl::Continue => {}
            ScanControl::Stop => break,
            ScanControl::Invalid => return None,
        }
        index += 1;
    }
    (index < characters.len() && characters[index] == '[' && !prefix.is_empty() && !in_quotes)
        .then_some((prefix, index, brace_nesting, format_wraps_name))
}

#[derive(Clone, Copy)]
enum PrefixAction {
    OpenFormat,
    CloseFormat,
    EscapedSpace,
    Delimiter,
    Separator,
    Push(char),
    Invalid,
}

#[derive(Clone, Copy)]
enum ScanControl {
    Continue,
    Stop,
    Invalid,
}

fn apply_vector_prefix_action(
    action: PrefixAction,
    prefix: &mut String,
    brace_nesting: &mut i64,
    format_wraps_name: &mut bool,
) -> ScanControl {
    match action {
        PrefixAction::OpenFormat => {
            *brace_nesting += 1;
            prefix.push('{');
            ScanControl::Continue
        }
        PrefixAction::CloseFormat if *brace_nesting > 0 => {
            *brace_nesting -= 1;
            prefix.push('}');
            ScanControl::Continue
        }
        PrefixAction::EscapedSpace => {
            prefix.push(' ');
            ScanControl::Continue
        }
        PrefixAction::Delimiter => {
            adjust_vector_format_prefix(prefix, *brace_nesting, format_wraps_name);
            ScanControl::Stop
        }
        PrefixAction::Push(character) => {
            prefix.push(character);
            ScanControl::Continue
        }
        PrefixAction::CloseFormat | PrefixAction::Invalid => ScanControl::Invalid,
        PrefixAction::Separator => unreachable!("vector prefix separator"),
    }
}

fn vector_prefix_action(characters: &[char], index: usize) -> PrefixAction {
    match characters[index] {
        '{' if index > 0 && is_format_marker(characters[index - 1]) => PrefixAction::OpenFormat,
        '{' => PrefixAction::Invalid,
        '}' => PrefixAction::CloseFormat,
        '\\' if characters.get(index + 1) == Some(&' ') => PrefixAction::EscapedSpace,
        ' ' | ']' => PrefixAction::Invalid,
        '[' => PrefixAction::Delimiter,
        character => PrefixAction::Push(character),
    }
}

fn adjust_vector_format_prefix(
    prefix: &mut String,
    brace_nesting: i64,
    format_wraps_name: &mut bool,
) {
    if brace_nesting <= 0 {
        return;
    }
    let Some(format_start) = prefix.rfind('{') else {
        return;
    };
    let before = prefix[..format_start].chars().next_back();
    if !before.is_some_and(is_format_marker) {
        return;
    }
    if format_start + 1 == prefix.len() {
        let marker_start = prefix[..format_start]
            .char_indices()
            .next_back()
            .map_or(0, |(offset, _)| offset);
        prefix.truncate(marker_start);
    } else {
        *format_wraps_name = true;
    }
}

fn parse_vector_suffix(
    characters: &[char],
    mut index: usize,
    brace_nesting: &mut i64,
    format_wraps_name: bool,
) -> Option<String> {
    let mut suffix = String::new();
    while index < characters.len() {
        match characters[index] {
            '}' => {
                *brace_nesting -= 1;
                if *brace_nesting < 0 {
                    return None;
                }
                if format_wraps_name {
                    suffix.push('}');
                }
            }
            character @ ('+' | '-' | 'P' | 'N') => suffix.push(character),
            _ => return None,
        }
        index += 1;
    }
    Some(suffix)
}

fn parse_index(characters: &[char], index: &mut usize, start: bool) -> Option<u32> {
    let digit_start = *index;
    while *index < characters.len() && characters[*index].is_ascii_digit() {
        *index += 1;
    }
    if digit_start == *index {
        return None;
    }
    let digits = characters[digit_start..*index].iter().collect::<String>();
    let value = digits.parse::<u32>().ok()?;
    if value > i32::MAX as u32 {
        return None;
    }
    if start {
        if characters.get(*index) != Some(&'.') || characters.get(*index + 1) != Some(&'.') {
            return None;
        }
        *index += 2;
    } else {
        if characters.get(*index) != Some(&']') {
            return None;
        }
        *index += 1;
    }
    Some(value)
}

fn parse_group_syntax(
    text: &str,
    limits: SchematicBusExpansionLimits,
    collect_members: bool,
) -> Result<Option<SchematicBusPattern>, SchematicBusExpansionError> {
    let characters = text.chars().collect::<Vec<_>>();
    if characters.len() < 3 {
        return Ok(None);
    }
    let Some((prefix, index)) = parse_group_prefix(&characters, text.len()) else {
        return Ok(None);
    };
    parse_group_members(&characters, index + 1, prefix, limits, collect_members)
}

fn parse_group_prefix(characters: &[char], capacity: usize) -> Option<(String, usize)> {
    let mut prefix = String::with_capacity(capacity);
    let mut index = 0_usize;
    let mut brace_nesting = 0_i64;
    let mut in_quotes = false;
    while index < characters.len() {
        if let Some(next) = consume_quoted_character(characters, index, &mut in_quotes, &mut prefix)
        {
            index = next;
            continue;
        }
        let action = group_prefix_action(characters, index);
        if matches!(action, PrefixAction::EscapedSpace) {
            index += 1;
        }
        match apply_group_prefix_action(action, &mut prefix, &mut brace_nesting) {
            ScanControl::Continue => {}
            ScanControl::Stop => break,
            ScanControl::Invalid => return None,
        }
        index += 1;
    }
    (index < characters.len() && characters[index] == '{' && brace_nesting == 0 && !in_quotes)
        .then_some((prefix, index))
}

fn apply_group_prefix_action(
    action: PrefixAction,
    prefix: &mut String,
    brace_nesting: &mut i64,
) -> ScanControl {
    match action {
        PrefixAction::OpenFormat => {
            *brace_nesting += 1;
            prefix.push('{');
            ScanControl::Continue
        }
        PrefixAction::CloseFormat if *brace_nesting > 0 => {
            *brace_nesting -= 1;
            prefix.push('}');
            ScanControl::Continue
        }
        PrefixAction::EscapedSpace => {
            prefix.push(' ');
            ScanControl::Continue
        }
        PrefixAction::Delimiter => ScanControl::Stop,
        PrefixAction::Push(character) => {
            prefix.push(character);
            ScanControl::Continue
        }
        PrefixAction::CloseFormat | PrefixAction::Invalid => ScanControl::Invalid,
        PrefixAction::Separator => unreachable!("group prefix separator"),
    }
}

fn group_prefix_action(characters: &[char], index: usize) -> PrefixAction {
    match characters[index] {
        '{' if index > 0 && is_format_marker(characters[index - 1]) => PrefixAction::OpenFormat,
        '{' => PrefixAction::Delimiter,
        '}' => PrefixAction::CloseFormat,
        '\\' if characters.get(index + 1) == Some(&' ') => PrefixAction::EscapedSpace,
        ' ' | '[' | ']' => PrefixAction::Invalid,
        character => PrefixAction::Push(character),
    }
}

fn parse_group_members(
    characters: &[char],
    mut index: usize,
    prefix: String,
    limits: SchematicBusExpansionLimits,
    collect_members: bool,
) -> Result<Option<SchematicBusPattern>, SchematicBusExpansionError> {
    let mut members = Vec::new();
    let mut member_count = 0_usize;
    let mut retained_bytes = 0_usize;
    let mut member = String::new();
    let mut in_quotes = false;
    let mut brace_nesting = 0_i64;
    while index < characters.len() {
        if let Some(next) = consume_quoted_character(characters, index, &mut in_quotes, &mut member)
        {
            index = next;
            continue;
        }
        match group_member_action(characters, index, brace_nesting) {
            PrefixAction::OpenFormat => {
                brace_nesting += 1;
                member.push('{');
            }
            PrefixAction::CloseFormat => {
                brace_nesting -= 1;
                member.push('}');
            }
            PrefixAction::Delimiter => {
                push_group_member(
                    &mut members,
                    &mut member_count,
                    &mut retained_bytes,
                    &mut member,
                    limits,
                    collect_members,
                )?;
                return Ok(finish_group(
                    prefix,
                    members,
                    member_count,
                    index + 1,
                    characters.len(),
                ));
            }
            PrefixAction::EscapedSpace => {
                member.push(' ');
                index += 1;
            }
            PrefixAction::Separator => push_group_member(
                &mut members,
                &mut member_count,
                &mut retained_bytes,
                &mut member,
                limits,
                collect_members,
            )?,
            PrefixAction::Push(character) => member.push(character),
            PrefixAction::Invalid => return Ok(None),
        }
        index += 1;
    }
    Ok(None)
}

fn finish_group(
    prefix: String,
    members: Vec<String>,
    member_count: usize,
    index: usize,
    length: usize,
) -> Option<SchematicBusPattern> {
    (index == length && member_count > 0).then_some(SchematicBusPattern { prefix, members })
}

fn group_member_action(characters: &[char], index: usize, brace_nesting: i64) -> PrefixAction {
    match characters[index] {
        '{' if index > 0 && is_format_marker(characters[index - 1]) => PrefixAction::OpenFormat,
        '{' => PrefixAction::Invalid,
        '}' if brace_nesting > 0 => PrefixAction::CloseFormat,
        '}' => PrefixAction::Delimiter,
        '\\' if characters.get(index + 1) == Some(&' ') => PrefixAction::EscapedSpace,
        ' ' | ',' => PrefixAction::Separator,
        character => PrefixAction::Push(character),
    }
}

fn consume_quoted_character(
    characters: &[char],
    index: usize,
    in_quotes: &mut bool,
    output: &mut String,
) -> Option<usize> {
    let character = characters[index];
    if character == '"' && !is_escaped(characters, index) {
        *in_quotes = !*in_quotes;
        return Some(index + 1);
    }
    if !*in_quotes {
        return None;
    }
    let value_index = if character == '\\' && index + 1 < characters.len() {
        index + 1
    } else {
        index
    };
    output.push(characters[value_index]);
    Some(value_index + 1)
}

fn push_group_member(
    members: &mut Vec<String>,
    member_count: &mut usize,
    retained_bytes: &mut usize,
    member: &mut String,
    limits: SchematicBusExpansionLimits,
    collect_member: bool,
) -> Result<(), SchematicBusExpansionError> {
    if member.is_empty() {
        return Ok(());
    }
    if *member_count >= limits.max_group_members {
        return Err(resource_error("bus member count exceeds its limit"));
    }
    if !collect_member {
        *member_count += 1;
        member.clear();
        return Ok(());
    }
    let next_bytes = retained_bytes
        .checked_add(escaped_net_name_bytes(member)?)
        .ok_or_else(|| resource_error("bus member bytes overflowed"))?;
    if next_bytes > limits.max_parsed_member_bytes {
        return Err(resource_error("bus member bytes exceed their limit"));
    }
    let escaped = escape_net_name(member);
    member.clear();
    *member_count += 1;
    *retained_bytes = next_bytes;
    members.push(escaped);
    Ok(())
}

fn escape_net_name(text: &str) -> String {
    text.replace(' ', "\\ ")
        .replace('/', "{slash}")
        .replace(['\n', '\r'], "")
}

fn escaped_net_name_bytes(text: &str) -> Result<usize, SchematicBusExpansionError> {
    text.chars().try_fold(0_usize, |total, character| {
        let bytes = match character {
            ' ' => 2,
            '/' => 7,
            '\n' | '\r' => 0,
            _ => character.len_utf8(),
        };
        total
            .checked_add(bytes)
            .ok_or_else(|| resource_error("bus member bytes overflowed"))
    })
}

fn is_format_marker(character: char) -> bool {
    matches!(character, '_' | '^' | '~')
}

fn is_escaped(characters: &[char], index: usize) -> bool {
    let mut backslashes = 0_usize;
    let mut cursor = index;
    while cursor > 0 && characters[cursor - 1] == '\\' {
        backslashes += 1;
        cursor -= 1;
    }
    backslashes % 2 == 1
}

fn qualify(prefix: &str, member: &str) -> String {
    if prefix.is_empty() {
        member.to_owned()
    } else {
        format!("{prefix}.{member}")
    }
}

fn join_qualifier(outer: &str, inner: &str) -> String {
    match (outer.is_empty(), inner.is_empty()) {
        (true, _) => inner.to_owned(),
        (_, true) => outer.to_owned(),
        (false, false) => format!("{outer}.{inner}"),
    }
}

fn joined_qualifier_length(outer: &str, inner: &str) -> Result<usize, SchematicBusExpansionError> {
    match (outer.is_empty(), inner.is_empty()) {
        (true, _) => Ok(inner.len()),
        (_, true) => Ok(outer.len()),
        (false, false) => outer
            .len()
            .checked_add(1)
            .and_then(|length| length.checked_add(inner.len()))
            .ok_or_else(|| resource_error("bus expansion qualifier bytes overflowed")),
    }
}

fn push_qualified_output(
    output: &mut Vec<String>,
    retained_bytes: &mut usize,
    qualifier: &str,
    member: &str,
    limits: SchematicBusExpansionLimits,
) -> Result<(), SchematicBusExpansionError> {
    if output.len() >= limits.max_expanded_members {
        return Err(resource_error("bus member count exceeds its limit"));
    }
    let qualified_bytes = if qualifier.is_empty() {
        member.len()
    } else {
        qualifier
            .len()
            .checked_add(1)
            .and_then(|length| length.checked_add(member.len()))
            .ok_or_else(|| resource_error("bus member bytes overflowed"))?
    };
    let next_bytes = retained_bytes
        .checked_add(qualified_bytes)
        .ok_or_else(|| resource_error("bus member bytes overflowed"))?;
    if next_bytes > limits.max_expanded_output_bytes {
        return Err(resource_error("bus member bytes exceed their limit"));
    }
    output.push(qualify(qualifier, member));
    *retained_bytes = next_bytes;
    Ok(())
}

fn push_bounded(
    output: &mut Vec<String>,
    retained_bytes: &mut usize,
    member: String,
    max_members: usize,
    max_bytes: usize,
) -> Result<(), SchematicBusExpansionError> {
    if output.len() >= max_members {
        return Err(resource_error("bus member count exceeds its limit"));
    }
    let next_bytes = retained_bytes
        .checked_add(member.len())
        .ok_or_else(|| resource_error("bus member bytes overflowed"))?;
    if next_bytes > max_bytes {
        return Err(resource_error("bus member bytes exceed their limit"));
    }
    *retained_bytes = next_bytes;
    output.push(member);
    Ok(())
}

fn push_task<'a>(
    stack: &mut Vec<ExpansionTask<'a>>,
    work_bytes: &mut usize,
    task: ExpansionTask<'a>,
    limits: SchematicBusExpansionLimits,
) -> Result<(), SchematicBusExpansionError> {
    if stack.len() >= limits.max_expansion_work_items {
        return Err(resource_error(
            "bus expansion work items exceed their limit",
        ));
    }
    let next_bytes = work_bytes
        .checked_add(task.retained_bytes())
        .ok_or_else(|| resource_error("bus expansion work bytes overflowed"))?;
    if next_bytes > limits.max_expansion_work_bytes {
        return Err(resource_error(
            "bus expansion work bytes exceed their limit",
        ));
    }
    *work_bytes = next_bytes;
    stack.push(task);
    Ok(())
}

fn check_input(
    text: &str,
    limits: SchematicBusExpansionLimits,
) -> Result<(), SchematicBusExpansionError> {
    if text.len() > limits.max_input_bytes {
        Err(resource_error("bus expression bytes exceed their limit"))
    } else {
        Ok(())
    }
}

fn resource_error(message: &str) -> SchematicBusExpansionError {
    SchematicBusExpansionError {
        kind: SchematicBusExpansionErrorKind::ResourceLimit,
        message: message.to_owned(),
    }
}
