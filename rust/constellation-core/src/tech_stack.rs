//! Technology clusters: which technologies are declared together, and where
//! each one sits. Deterministic for the same input. Numbers cross the WASM
//! boundary as flat arrays: every standalone HTML export carries this binary
//! under a size budget, and JSON (de)serialization here costs about 45 KB.

const MAX_NODES: usize = 256;
const MAX_GROUPS: usize = 16;
const MAX_REPOSITORIES: usize = 100_000;
const MAX_MEMBERSHIPS: usize = 128;
const MAX_CROSS_LINKS: u32 = 512;
const RELAX_ROUNDS: usize = 400;
const MIN_RADIUS: f64 = 2.6;
const RADIUS_RANGE: f64 = 15.0;
// One spiral step per member, wider than tall because labels are wide.
const SPIRAL_STEP: f64 = 19.0;
const SPIRAL_STRETCH: f64 = 1.7;
const GOLDEN_ANGLE: f64 = 2.39996;
const LABEL_ROOM: f64 = 15.0;
const MARGIN_X: f64 = 44.0;
const MARGIN_TOP: f64 = 34.0;
const MARGIN_BOTTOM: f64 = 48.0;
const RING_START: f64 = -2.6;

/// Nodes arrive sorted by the caller, whose order settles every tie here.
pub struct Input<'a> {
    pub width: f64,
    pub height: f64,
    /// One entry per group: non-zero when it belongs at the center.
    pub group_core: &'a [u8],
    pub node_group: &'a [u32],
    pub node_count: &'a [u32],
    pub label_width: &'a [f64],
    /// `repository_offsets[i]..repository_offsets[i + 1]` indexes `repository_members`.
    pub repository_offsets: &'a [u32],
    pub repository_members: &'a [u32],
    pub cross_links: u32,
}

struct Body {
    x: f64,
    y: f64,
    radius: f64,
    half_width: f64,
}

/// One signal rather than a message per case: only the caller's own builder
/// reaches this, and each message costs WASM in every standalone HTML export.
fn valid(input: &Input) -> bool {
    let size_ok = |value: f64| value.is_finite() && (100.0..=10_000.0).contains(&value);
    let nodes = input.node_group.len();
    let offsets = input.repository_offsets;
    size_ok(input.width)
        && size_ok(input.height)
        && nodes <= MAX_NODES
        && input.group_core.len() <= MAX_GROUPS
        && input.node_count.len() == nodes
        && input.label_width.len() == nodes
        && input.cross_links <= MAX_CROSS_LINKS
        && offsets.len() <= MAX_REPOSITORIES + 1
        && input.node_group.iter().all(|&group| (group as usize) < input.group_core.len())
        && input.label_width.iter().all(|width| width.is_finite() && (0.0..=1000.0).contains(width))
        && offsets.first().is_none_or(|&first| first == 0)
        && offsets.last().map_or(input.repository_members.is_empty(), |&last| last as usize == input.repository_members.len())
        && offsets.windows(2).all(|pair| pair[1] >= pair[0] && (pair[1] - pair[0]) as usize <= MAX_MEMBERSHIPS)
        && input.repository_members.iter().all(|&member| (member as usize) < nodes)
}

/// Each technology's closest partner by overlap, then the most-shared pairs
/// that cross groups. Core groups are skipped there: they would link to everything.
/// Written without std sorts, which cost several KB of WASM per element type.
fn select_links(input: &Input) -> Vec<(u32, u32, u32)> {
    let size = input.node_group.len();
    let mut shared = vec![0u32; size * size];
    let mut seen = vec![0u32; size];
    // The last repository each node appeared in, so a repeated member counts once.
    let mut stamp = vec![usize::MAX; size];
    let mut unique: Vec<usize> = Vec::with_capacity(MAX_MEMBERSHIPS);
    for (repository, pair) in input.repository_offsets.windows(2).enumerate() {
        unique.clear();
        for &member in &input.repository_members[pair[0] as usize..pair[1] as usize] {
            let member = member as usize;
            if stamp[member] != repository {
                stamp[member] = repository;
                seen[member] += 1;
                for &other in &unique {
                    shared[other.min(member) * size + other.max(member)] += 1;
                }
                unique.push(member);
            }
        }
    }
    // A pair or two means little in a large organization, and plenty for one person.
    let repositories = input.repository_offsets.len().saturating_sub(1);
    let floor = if repositories >= 100 { 3 } else { 1 };
    let mut chosen = vec![false; size * size];
    // Each node's best partner, compared as exact fractions so rounding can't reorder a tie.
    for node in 0..size {
        let mut best: Option<(usize, u64, u64)> = None;
        for other in 0..size {
            if other == node {
                continue;
            }
            let key = node.min(other) * size + node.max(other);
            let count = u64::from(shared[key]);
            if count < u64::from(floor) {
                continue;
            }
            let union = u64::from(seen[node]) + u64::from(seen[other]) - count;
            if best.is_none_or(|(_, top, bottom)| count * bottom > top * union) {
                best = Some((key, count, union));
            }
        }
        if let Some((key, _, _)) = best {
            chosen[key] = true;
        }
    }
    // The most-shared crossing pairs, one pass per link: at most 512 passes over 32,640 pairs.
    let core = |index: usize| input.group_core[input.node_group[index] as usize] != 0;
    let mut taken = vec![false; size * size];
    for _ in 0..input.cross_links {
        let mut best: Option<(usize, u32)> = None;
        for a in 0..size {
            for b in a + 1..size {
                let key = a * size + b;
                if !taken[key] && shared[key] >= floor && input.node_group[a] != input.node_group[b] && !core(a) && !core(b) && best.is_none_or(|(_, count)| shared[key] > count) {
                    best = Some((key, shared[key]));
                }
            }
        }
        let Some((key, _)) = best else { break };
        taken[key] = true;
        chosen[key] = true;
    }
    let mut links = Vec::new();
    for a in 0..size {
        for b in a + 1..size {
            if chosen[a * size + b] {
                links.push((a as u32, b as u32, shared[a * size + b]));
            }
        }
    }
    links
}

fn anchors(input: &Input, used: &[bool]) -> Vec<(f64, f64)> {
    let center = (input.width / 2.0, input.height * 0.485);
    let ring = input.group_core.iter().enumerate().filter(|(index, &core)| used[*index] && core == 0).count();
    // A small ring has no reason to spread out as far.
    let spread = if ring < 3 { 0.2 } else { 0.36 };
    let step = std::f64::consts::TAU / ring.max(1) as f64;
    let mut placed = 0.0;
    input
        .group_core
        .iter()
        .enumerate()
        .map(|(index, &core)| {
            if core != 0 || !used[index] {
                return center;
            }
            let angle = RING_START + step * placed;
            placed += 1.0;
            (center.0 + angle.cos() * input.width * spread, center.1 + angle.sin() * input.height * spread)
        })
        .collect()
}

fn relax(bodies: &mut [Body], width: f64, height: f64) {
    let clamp = |body: &mut Body| {
        body.x = body.x.clamp(MARGIN_X, width - MARGIN_X);
        body.y = body.y.clamp(MARGIN_TOP, height - MARGIN_BOTTOM);
    };
    for body in bodies.iter_mut() {
        clamp(body);
    }
    for _ in 0..RELAX_ROUNDS {
        let mut moved = false;
        for i in 0..bodies.len() {
            let (head, tail) = bodies.split_at_mut(i + 1);
            let a = &mut head[i];
            for b in tail.iter_mut() {
                let gap_x = a.half_width.max(a.radius) + b.half_width.max(b.radius) + 3.0 - (a.x - b.x).abs();
                let gap_y = a.radius + b.radius + LABEL_ROOM - (a.y - b.y).abs();
                if gap_x <= 0.0 || gap_y <= 0.0 {
                    continue;
                }
                moved = true;
                if gap_y < gap_x {
                    let push = gap_y / 2.0 * if a.y <= b.y { -1.0 } else { 1.0 };
                    a.y += push;
                    b.y -= push;
                } else {
                    let push = gap_x / 2.0 * if a.x <= b.x { -1.0 } else { 1.0 };
                    a.x += push;
                    b.x -= push;
                }
                clamp(a);
                clamp(b);
            }
        }
        if !moved {
            break;
        }
    }
}

/// Flat result: `[nodes, groups, links]`, then `x, y, radius` per node in input
/// order, `group, x, y` per drawn group, and `from, to, shared` per link.
pub fn layout(input: &Input) -> Option<Vec<f64>> {
    if !valid(input) {
        return None;
    }
    let nodes = input.node_group.len();
    let largest = input.node_count.iter().copied().max().unwrap_or(0).max(1);
    let mut used = vec![false; input.group_core.len()];
    for &group in input.node_group {
        used[group as usize] = true;
    }
    let centers = anchors(input, &used);
    // Biggest first within each group; input order breaks ties. At most 256 entries.
    let mut order: Vec<usize> = Vec::with_capacity(nodes);
    for index in 0..nodes {
        let rank = (input.node_group[index], u32::MAX - input.node_count[index]);
        let mut slot = order.len();
        while slot > 0 && (input.node_group[order[slot - 1]], u32::MAX - input.node_count[order[slot - 1]]) > rank {
            slot -= 1;
        }
        order.insert(slot, index);
    }
    let mut bodies = Vec::with_capacity(nodes);
    let (mut group, mut rank) = (u32::MAX, 0.0f64);
    for &index in &order {
        if input.node_group[index] != group {
            group = input.node_group[index];
            rank = 0.0;
        }
        let center = centers[group as usize];
        let distance = SPIRAL_STEP * rank.sqrt();
        let angle = rank * GOLDEN_ANGLE;
        rank += 1.0;
        bodies.push(Body {
            x: center.0 + angle.cos() * distance * SPIRAL_STRETCH,
            y: center.1 + angle.sin() * distance,
            radius: MIN_RADIUS + RADIUS_RANGE * (f64::from(input.node_count[index]) / f64::from(largest)).sqrt(),
            half_width: input.label_width[index] / 2.0,
        });
    }
    relax(&mut bodies, input.width, input.height);
    let mut groups = Vec::new();
    for entry in 0..input.group_core.len() as u32 {
        let (mut sum, mut members, mut top) = (0.0, 0.0, f64::INFINITY);
        for (body, &index) in bodies.iter().zip(&order) {
            if input.node_group[index] == entry {
                sum += body.x;
                members += 1.0;
                top = top.min(body.y - body.radius);
            }
        }
        if members > 0.0 {
            groups.push((f64::from(entry), sum / members, (top - 8.0).max(12.0)));
        }
    }
    let links = select_links(input);
    let mut output = vec![0.0; 3 + nodes * 3 + groups.len() * 3 + links.len() * 3];
    output[0] = nodes as f64;
    output[1] = groups.len() as f64;
    output[2] = links.len() as f64;
    for (body, &index) in bodies.iter().zip(&order) {
        output[3 + index * 3] = body.x;
        output[4 + index * 3] = body.y;
        output[5 + index * 3] = body.radius;
    }
    let mut at = 3 + nodes * 3;
    for (entry, x, y) in groups {
        output[at] = entry;
        output[at + 1] = x;
        output[at + 2] = y;
        at += 3;
    }
    for (from, to, shared) in links {
        output[at] = f64::from(from);
        output[at + 1] = f64::from(to);
        output[at + 2] = f64::from(shared);
        at += 3;
    }
    Some(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Owned {
        group_core: Vec<u8>,
        node_group: Vec<u32>,
        node_count: Vec<u32>,
        label_width: Vec<f64>,
        offsets: Vec<u32>,
        members: Vec<u32>,
        width: f64,
    }

    impl Owned {
        fn input(&self) -> Input<'_> {
            Input {
                width: self.width,
                height: 540.0,
                group_core: &self.group_core,
                node_group: &self.node_group,
                node_count: &self.node_count,
                label_width: &self.label_width,
                repository_offsets: &self.offsets,
                repository_members: &self.members,
                cross_links: 8,
            }
        }
    }

    // JavaScript, React, Vue, Express, MongoDB.
    fn sample() -> Owned {
        let (mut offsets, mut members) = (vec![0], Vec::new());
        for i in 0..120 {
            members.extend_from_slice(match i % 6 {
                0 | 1 => &[0, 1, 3, 4][..],
                2 | 3 => &[0, 1][..],
                4 => &[0, 3][..],
                _ => &[0, 2][..],
            });
            offsets.push(members.len() as u32);
        }
        Owned {
            group_core: vec![1, 0, 0, 0],
            node_group: vec![0, 1, 1, 2, 3],
            node_count: vec![300, 200, 10, 90, 60],
            label_width: vec![58.0, 29.0, 17.0, 41.0, 41.0],
            offsets,
            members,
            width: 900.0,
        }
    }

    fn links(output: &[f64]) -> Vec<(u32, u32, u32)> {
        let start = 3 + output[0] as usize * 3 + output[1] as usize * 3;
        output[start..].chunks(3).map(|link| (link[0] as u32, link[1] as u32, link[2] as u32)).collect()
    }

    #[test]
    fn same_input_gives_same_output() {
        assert_eq!(layout(&sample().input()).unwrap(), layout(&sample().input()).unwrap());
    }

    #[test]
    fn nodes_stay_in_bounds_and_apart_with_area_scaled_radii() {
        let output = layout(&sample().input()).unwrap();
        let nodes: Vec<&[f64]> = output[3..3 + output[0] as usize * 3].chunks(3).collect();
        for node in &nodes {
            assert!(node[0] >= MARGIN_X && node[0] <= 900.0 - MARGIN_X);
            assert!(node[1] >= MARGIN_TOP && node[1] <= 540.0 - MARGIN_BOTTOM);
        }
        for (i, a) in nodes.iter().enumerate() {
            for b in &nodes[i + 1..] {
                assert!((a[0] - b[0]).hypot(a[1] - b[1]) > a[2].min(b[2]));
            }
        }
        assert!(nodes[0][2] > nodes[1][2] && nodes[1][2] > nodes[2][2]);
        assert!((nodes[0][2] - (MIN_RADIUS + RADIUS_RANGE)).abs() < 1e-9);
    }

    #[test]
    fn links_are_real_cooccurrence_counts() {
        let found = links(&layout(&sample().input()).unwrap());
        assert!(found.contains(&(1, 3, 40)), "React and Express share 40: {found:?}");
        // Vue shares a repository only with JavaScript, so no other Vue line may exist.
        assert!(found.iter().filter(|link| link.0 == 2 || link.1 == 2).all(|link| link.0 == 0));
    }

    #[test]
    fn repeated_membership_counts_once() {
        let mut data = sample();
        data.offsets = vec![0, 4];
        data.members = vec![1, 1, 3, 3];
        assert_eq!(links(&layout(&data.input()).unwrap()), vec![(1, 3, 1)]);
    }

    #[test]
    fn a_core_group_stays_out_of_crossing_links() {
        let mut data = sample();
        data.offsets = (0..=120).map(|i| i * 2).collect();
        data.members = (0..120).flat_map(|i| [0, if i < 60 { 1 } else { 3 }]).collect();
        let found = links(&layout(&data.input()).unwrap());
        assert!(found.iter().all(|link| link.0 == 0), "only closest-partner links touch the core: {found:?}");
    }

    #[test]
    fn invalid_input_is_an_error_not_a_panic() {
        let change = |edit: &dyn Fn(&mut Owned)| {
            let mut data = sample();
            edit(&mut data);
            layout(&data.input()).is_none()
        };
        assert!(change(&|data| data.node_group[0] = 99));
        assert!(change(&|data| data.members[0] = 99));
        assert!(change(&|data| data.width = f64::NAN));
        assert!(change(&|data| data.label_width[0] = f64::INFINITY));
        assert!(change(&|data| data.node_count.pop().map(|_| ()).unwrap_or(())));
        assert!(change(&|data| data.offsets[1] = 9_999));
        assert!(change(&|data| data.offsets[0] = 1));
        assert!(change(&|data| *data.offsets.last_mut().unwrap() = 1));
        assert!(change(&|data| {
            data.node_group = vec![0; MAX_NODES + 1];
            data.node_count = vec![1; MAX_NODES + 1];
            data.label_width = vec![1.0; MAX_NODES + 1];
        }));
        assert!(change(&|data| {
            data.offsets = vec![0, MAX_MEMBERSHIPS as u32 + 1];
            data.members = vec![0; MAX_MEMBERSHIPS + 1];
        }));
    }

    #[test]
    fn empty_input_is_empty_output() {
        let data = Owned { group_core: vec![], node_group: vec![], node_count: vec![], label_width: vec![], offsets: vec![], members: vec![], width: 900.0 };
        assert_eq!(layout(&data.input()).unwrap(), vec![0.0, 0.0, 0.0]);
    }
}
