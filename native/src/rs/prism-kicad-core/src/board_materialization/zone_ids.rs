//! Zone source UIDs that are unique across one board.
//!
//! A zone's source UID is its KiCad UUID, as for every other object. Legacy
//! boards can carry a nil UUID, or the same UUID on several zones (KiCad
//! reassigns repeats when it loads them). Such a zone falls back to
//! `zone@<byte offset>`, the form [`source_uid`] already gives a zone with
//! no UUID; in file order, the first zone with a UUID keeps it.

use super::emit::source_uid;
use crate::pcb::PcbZone;
use std::collections::BTreeSet;

/// Board-wide zone UIDs (board and footprint zones together).
#[derive(Default)]
pub(crate) struct ZoneIds {
    /// Source offsets of zones whose UUID is nil or repeats an earlier one.
    fallback: BTreeSet<usize>,
}

fn is_nil(uuid: &str) -> bool {
    uuid.bytes().all(|byte| matches!(byte, b'0' | b'-'))
}

impl ZoneIds {
    /// UIDs for `zones`, every zone of the board in any order.
    pub(crate) fn new<'a>(zones: impl IntoIterator<Item = &'a PcbZone>) -> Self {
        let mut all: Vec<(usize, &str)> = zones
            .into_iter()
            .filter_map(|zone| {
                let uuid = zone.uuid.as_deref().filter(|uuid| !uuid.is_empty())?;
                Some((zone.source_range.start, uuid))
            })
            .collect();
        all.sort_unstable();
        let mut seen = BTreeSet::new();
        let fallback = all
            .into_iter()
            .filter(|(_, uuid)| is_nil(uuid) || !seen.insert(*uuid))
            .map(|(start, _)| start)
            .collect();
        Self { fallback }
    }

    /// The source UID of `zone`.
    pub(crate) fn uid(&self, zone: &PcbZone) -> String {
        let start = zone.source_range.start;
        let uuid = zone
            .uuid
            .as_deref()
            .filter(|_| !self.fallback.contains(&start));
        source_uid("zone", uuid, start)
    }
}

#[cfg(test)]
mod tests {
    use super::ZoneIds;
    use crate::pcb::PcbView;

    const BOARD: &str = r#"(kicad_pcb (version 20241229) (generator "pcbnew")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal))
  (zone (net 0) (layer "F.Cu") (uuid "11111111-1111-4111-8111-111111111111")
    (polygon (pts (xy 0 0) (xy 1 0) (xy 1 1))))
  (zone (net 0) (layer "F.Cu") (uuid "11111111-1111-4111-8111-111111111111")
    (polygon (pts (xy 0 0) (xy 2 0) (xy 2 2))))
  (zone (net 0) (layer "B.Cu") (uuid "00000000-0000-0000-0000-000000000000")
    (polygon (pts (xy 0 0) (xy 3 0) (xy 3 3))))
  (zone (net 0) (layer "B.Cu")
    (polygon (pts (xy 0 0) (xy 4 0) (xy 4 4))))
)"#;

    #[test]
    fn nil_and_repeated_uuids_fall_back_to_the_offset() {
        let view = PcbView::parse(BOARD, Default::default()).unwrap();
        let zones: Vec<_> = view.zones().map(Result::unwrap).collect();
        let ids = ZoneIds::new(&zones);
        let uids: Vec<String> = zones.iter().map(|zone| ids.uid(zone)).collect();
        assert_eq!(uids[0], "11111111-1111-4111-8111-111111111111");
        for (uid, zone) in uids.iter().zip(&zones).skip(1) {
            assert_eq!(uid, &format!("zone@{}", zone.source_range.start));
        }
        let distinct: std::collections::BTreeSet<_> = uids.iter().collect();
        assert_eq!(distinct.len(), uids.len());
    }
}
