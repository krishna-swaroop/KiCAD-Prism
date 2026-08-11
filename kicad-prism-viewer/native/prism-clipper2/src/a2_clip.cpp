#include "a2_types.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <set>
#include <stdexcept>
#include <tuple>
#include <unordered_map>

#include "clipper2/clipper.h"

namespace prism::clipper2 {

namespace {

using Clipper2Lib::ClipType;
using Clipper2Lib::FillRule;
using Clipper2Lib::Path64;
using Clipper2Lib::Paths64;
using Clipper2Lib::Point64;
using Clipper2Lib::PolyPath64;
using Clipper2Lib::PolyTree64;

double signed_area(const Ring& ring) {
    if (ring.size() < 3) return 0.0;
    long double area = 0.0;
    for (size_t i = 0; i < ring.size(); ++i) {
        const Point& a = ring[i];
        const Point& b = ring[(i + 1) % ring.size()];
        area += static_cast<long double>(a.x) * static_cast<long double>(b.y)
            - static_cast<long double>(b.x) * static_cast<long double>(a.y);
    }
    return static_cast<double>(area / 2.0L);
}

bool less_point(const Point& a, const Point& b) {
    if (a.x != b.x) return a.x < b.x;
    return a.y < b.y;
}

Ring clean_ring(Ring ring) {
    Ring cleaned;
    cleaned.reserve(ring.size());
    for (const Point& point : ring) {
        if (cleaned.empty() || cleaned.back().x != point.x || cleaned.back().y != point.y) {
            cleaned.push_back(point);
        }
    }
    if (cleaned.size() > 1 && cleaned.front().x == cleaned.back().x && cleaned.front().y == cleaned.back().y) {
        cleaned.pop_back();
    }
    if (cleaned.size() < 3 || std::abs(signed_area(cleaned)) < 1.0) {
        return {};
    }

    size_t start = 0;
    for (size_t i = 1; i < cleaned.size(); ++i) {
        if (less_point(cleaned[i], cleaned[start])) start = i;
    }
    Ring canonical;
    canonical.reserve(cleaned.size());
    for (size_t i = 0; i < cleaned.size(); ++i) {
        canonical.push_back(cleaned[(start + i) % cleaned.size()]);
    }
    return canonical;
}

Ring orient_ring(Ring ring, bool positive) {
    ring = clean_ring(std::move(ring));
    if (ring.empty()) return ring;
    const bool is_positive = signed_area(ring) >= 0.0;
    if (is_positive != positive) {
        std::reverse(ring.begin(), ring.end());
        ring = clean_ring(std::move(ring));
    }
    return ring;
}

Path64 to_path64(const Ring& ring) {
    Path64 path;
    path.reserve(ring.size());
    for (const Point& point : ring) {
        path.push_back(Point64(point.x, point.y));
    }
    return path;
}

Ring from_path64(const Path64& path) {
    Ring ring;
    ring.reserve(path.size());
    for (const Point64& point : path) {
        ring.push_back(Point{point.x, point.y});
    }
    return ring;
}

Paths64 subject_paths(const Subject& subject) {
    Paths64 paths;
    Ring outer = orient_ring(subject.outer, true);
    if (!outer.empty()) {
        paths.push_back(to_path64(outer));
    }
    for (const Ring& hole : subject.holes) {
        Ring cleaned = orient_ring(hole, false);
        if (!cleaned.empty()) {
            paths.push_back(to_path64(cleaned));
        }
    }
    return paths;
}

Path64 tile_path(const Job& job, int64_t tile_size_nm) {
    const int64_t x0 = static_cast<int64_t>(job.tile_x) * tile_size_nm;
    const int64_t y0 = static_cast<int64_t>(job.tile_y) * tile_size_nm;
    const int64_t x1 = x0 + tile_size_nm;
    const int64_t y1 = y0 + tile_size_nm;
    return Path64{
        Point64(x0, y0),
        Point64(x1, y0),
        Point64(x1, y1),
        Point64(x0, y1),
    };
}

std::tuple<int64_t, int64_t, int64_t, int64_t> bounds(const Ring& ring) {
    int64_t min_x = ring.front().x;
    int64_t min_y = ring.front().y;
    int64_t max_x = ring.front().x;
    int64_t max_y = ring.front().y;
    for (const Point& point : ring) {
        min_x = std::min(min_x, point.x);
        min_y = std::min(min_y, point.y);
        max_x = std::max(max_x, point.x);
        max_y = std::max(max_y, point.y);
    }
    return {min_x, min_y, max_x, max_y};
}

bool region_less(const Region& a, const Region& b) {
    const double area_a = std::abs(signed_area(a.outer));
    const double area_b = std::abs(signed_area(b.outer));
    if (area_a != area_b) return area_a > area_b;
    const auto ba = bounds(a.outer);
    const auto bb = bounds(b.outer);
    if (ba != bb) return ba < bb;
    return a.outer.size() < b.outer.size();
}

void append_regions_from_node(const PolyPath64& node, std::vector<Region>& regions) {
    for (const auto& child_ptr : node) {
        const PolyPath64& child = *child_ptr;
        if (child.IsHole()) {
            append_regions_from_node(child, regions);
            continue;
        }
        Region region;
        region.outer = orient_ring(from_path64(child.Polygon()), true);
        if (region.outer.empty()) {
            append_regions_from_node(child, regions);
            continue;
        }
        for (const auto& hole_ptr : child) {
            const PolyPath64& hole = *hole_ptr;
            if (!hole.IsHole()) {
                append_regions_from_node(hole, regions);
                continue;
            }
            Ring hole_ring = orient_ring(from_path64(hole.Polygon()), false);
            if (!hole_ring.empty()) {
                region.holes.push_back(std::move(hole_ring));
            }
            append_regions_from_node(hole, regions);
        }
        std::sort(region.holes.begin(), region.holes.end(), [](const Ring& a, const Ring& b) {
            const double area_a = std::abs(signed_area(a));
            const double area_b = std::abs(signed_area(b));
            if (area_a != area_b) return area_a > area_b;
            return bounds(a) < bounds(b);
        });
        regions.push_back(std::move(region));
    }
}

std::vector<Region> clip_job(const Subject& subject, const Job& job, int64_t tile_size_nm) {
    Paths64 subjects = subject_paths(subject);
    if (subjects.empty()) return {};
    Paths64 clips{tile_path(job, tile_size_nm)};
    PolyTree64 tree;
    Clipper2Lib::Clipper64 clipper;
    clipper.AddSubject(subjects);
    clipper.AddClip(clips);
    clipper.Execute(ClipType::Intersection, FillRule::NonZero, tree);

    std::vector<Region> regions;
    append_regions_from_node(tree, regions);
    std::sort(regions.begin(), regions.end(), region_less);
    return regions;
}

}  // namespace

std::vector<Result> clip_a2_request(const Request& request) {
    std::unordered_map<std::string, const Subject*> subjects;
    subjects.reserve(request.subjects.size());
    for (const Subject& subject : request.subjects) {
        if (subject.subject_id.empty()) {
            throw std::runtime_error("A2 subject has empty subjectId");
        }
        if (!subjects.emplace(subject.subject_id, &subject).second) {
            throw std::runtime_error("A2 request contains duplicate subjectId");
        }
    }

    std::set<std::string> seen_jobs;
    std::vector<Result> results;
    results.reserve(request.jobs.size());
    for (const Job& job : request.jobs) {
        if (job.job_id.empty()) {
            throw std::runtime_error("A2 job has empty jobId");
        }
        if (!seen_jobs.insert(job.job_id).second) {
            throw std::runtime_error("A2 request contains duplicate jobId");
        }
        const auto subject_it = subjects.find(job.subject_id);
        if (subject_it == subjects.end()) {
            throw std::runtime_error("A2 job references missing subjectId");
        }
        Result result;
        result.job_id = job.job_id;
        result.subject_id = job.subject_id;
        result.tile_x = job.tile_x;
        result.tile_y = job.tile_y;
        result.regions = clip_job(*subject_it->second, job, request.tile_size_nm);
        result.status = result.regions.empty() ? ResultStatus::Empty : ResultStatus::Ok;
        results.push_back(std::move(result));
    }
    return results;
}

}  // namespace prism::clipper2
