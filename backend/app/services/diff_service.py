"""
Native Visual Diff Service

Generates visual diffs between commits using local kicad-cli.
"""

import os
import subprocess
import threading
import uuid
import shutil
import time
import json
import re
from pathlib import Path
from typing import Optional, List, Dict
from app.services.project_service import get_registered_projects, find_schematic_file
from app.services import bom_diff_service

# Global job store
# Structure: { job_id: { ... } }
diff_jobs: Dict[str, dict] = {}

# Configuration
MAX_JOB_AGE_SECONDS = 3600 * 24  # 24 hours

import platform

def _get_cli_command() -> str:
    """Find valid kicad-cli command across different OS platforms."""
    # 1. Check environment variable override
    env_path = os.environ.get("KICAD_CLI_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    # 2. Check PATH
    cli_name = "kicad-cli.exe" if platform.system() == "Windows" else "kicad-cli"
    if shutil.which(cli_name):
        return cli_name
    
    # 3. Check common OS-specific installation paths
    system = platform.system()
    paths_to_check = []

    if system == "Darwin": # macOS
        paths_to_check = [
            "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli",
            os.path.expanduser("~/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli")
        ]
    elif system == "Windows":
        # Check standard C:\Program Files paths, possibly trying different versions
        program_files = os.environ.get("ProgramFiles", "C:\\Program Files")
        kicad_root = Path(program_files) / "KiCad"
        if kicad_root.exists():
            # Try to find the latest version bin folder
            # Usually KiCad/8.0/bin/kicad-cli.exe
            versions = sorted([d for d in kicad_root.iterdir() if d.is_dir()], reverse=True)
            for v in versions:
                candidate = v / "bin" / "kicad-cli.exe"
                if candidate.exists():
                    paths_to_check.append(str(candidate))
        
        # Fallback to direct path if version detection fails
        paths_to_check.append(f"{program_files}\\KiCad\\8.0\\bin\\kicad-cli.exe")
        paths_to_check.append(f"{program_files}\\KiCad\\7.0\\bin\\kicad-cli.exe")

    elif system == "Linux":
        paths_to_check = [
            "/usr/bin/kicad-cli",
            "/usr/local/bin/kicad-cli",
            # Flatpak fallback
            "/var/lib/flatpak/exports/bin/org.kicad.KiCad" 
        ]
    
    for path in paths_to_check:
        if os.path.exists(path):
            return path
            
    # Fallback to default name
    return cli_name

CLI_CMD = _get_cli_command()
print(f"[{platform.system()}] Resolved kicad-cli: {CLI_CMD}")


def _find_kicad_pro_file(directory: Path) -> Optional[Path]:
    try:
        if not directory.exists(): return None
        for file in directory.iterdir():
            if file.suffix == ".kicad_pro":
                return file
    except OSError:
        pass
    return None

def _find_kicad_pcb_file(directory: Path) -> Optional[Path]:
    try:
        if not directory.exists(): return None
        for file in directory.iterdir():
            if file.suffix == ".kicad_pcb":
                return file
    except OSError:
        pass
    return None

def _cleanup_job(job_id: str):
    """Remove a job directory and entry."""
    if job_id in diff_jobs:
        job = diff_jobs[job_id]
        if job.get('status') == 'running':
            # Don't delete running jobs to avoid race conditions with tar/kicad-cli
            job['status'] = 'failed'
            job['error'] = 'Job cancelled by user'
            return

        output_dir = job.get('abs_output_path')
        if output_dir and os.path.exists(output_dir):
            try:
                # Give background threads a moment to finish current syscalls
                time.sleep(0.5) 
                shutil.rmtree(output_dir)
            except Exception as e:
                print(f"Error cleaning up job {job_id}: {e}")
        del diff_jobs[job_id]

def delete_job(job_id: str):
    """Public method to delete a job."""
    _cleanup_job(job_id)

def _snapshot_commit(project_path: Path, commit: str, destination: Path):
    """Snapshot a commit into destination using git archive."""
    destination.mkdir(parents=True, exist_ok=True)
    
    # git archive --format=tar commit | tar -x -C destination
    tar_cmd = ["git", "archive", "--format=tar", commit]
    
    # Run in repo root
    p1 = subprocess.Popen(tar_cmd, cwd=project_path, stdout=subprocess.PIPE)
    p2 = subprocess.Popen(["tar", "-x", "-C", str(destination)], stdin=p1.stdout)
    p1.stdout.close()
    p2.wait()
    
    if p2.returncode != 0:
        raise Exception(f"Failed to extract snapshot for {commit}")

def _get_pcb_layers(pcb_path: Path) -> List[str]:
    """
    Extract active layer names from the .kicad_pcb file.
    """
    if not pcb_path.exists():
        return []
        
    try:
        # Read the beginning of the file to find the layers block
        # PCB files can be large, but the layers block is usually within the first 10k bytes
        with open(pcb_path, 'r', encoding='utf-8', errors='ignore') as f:
            head = f.read(20000)
            
        # Find the layers section: (layers ... (count "name" type ...) ...)
        layers_match = re.search(r'\(layers\s+(.*?)\s+\(setup', head, re.DOTALL)
        if not layers_match:
            # Fallback to a broader search if setup block isn't immediately after
            layers_match = re.search(r'\(layers\s+(.*?)\n\s+\)', head, re.DOTALL)
            
        if layers_match:
            block = layers_match.group(1)
            # Find all strings in quotes: e.g. (0 "F.Cu" signal)
            layer_names = re.findall(r'"([^"]+)"', block)
            if layer_names:
                return layer_names
                
    except Exception as e:
        print(f"Error parsing PCB layers: {e}")
        
    # Fallback to standard layers if parsing fails
    return ["F.Cu", "B.Cu", "F.SilkS", "B.SilkS", "F.Mask", "B.Mask", "Edge.Cuts"]
    

def _colorize_svg(svg_path: Path, color: str):
    """
    Replaces black lines/fills in the SVG with the specified color.
    Assumes SVG was exported with --black-and-white.
    """
    if not svg_path.exists():
        return
        
    content = svg_path.read_text(encoding="utf-8")
    
    # Regex for black colors
    # Matches: stroke="#000000", stroke="black", stroke="rgb(0,0,0)", fill="..."
    # We want to replace the color value with our target color.
    
    # Pattern: (stroke|fill)="(?:\#000000|\#000|black|rgb\(0,\s*0,\s*0\))"
    pattern = r'(stroke|fill)="(?:\#000000|\#000|black|rgb\(0,\s*0,\s*0\))"'
    
    def replacer(match):
        attr = match.group(1)
        return f'{attr}="{color}"'
        
    content = re.sub(pattern, replacer, content)
    
    # Also handle style="..." blocks if used
    # style="...; fill:#000000; ..."
    style_pattern = r'(fill|stroke):(?:\#000000|\#000|black|rgb\(0,\s*0,\s*0\))'
    content = re.sub(style_pattern, f'\\1:{color}', content)
        
    svg_path.write_text(content, encoding="utf-8")

def _run_diff_generation(job_id: str, project_id: str, commit1: str, commit2: str):
    """Execute diff generation in background."""
    job = diff_jobs[job_id]
    
    try:
        # 1. Setup paths
        projects = get_registered_projects()
        project = next((p for p in projects if p.id == project_id), None)
        if not project:
            raise ValueError(f"Project '{project_id}' not found")
            
        project_path = Path(project.path)
        job_dir = (Path("/tmp/prism_diff") / job_id).resolve()
        job_dir.mkdir(parents=True, exist_ok=True)
        job['abs_output_path'] = str(job_dir)
        
        job['logs'].append(f"Started diff job for {project_id}")
        job['logs'].append(f"Output directory: {job_dir}")
        
        manifest = {
            "job_id": job_id,
            "commit1": commit1,
            "commit2": commit2,
            "schematic": True,
            "pcb": True,
            "bom": None,
        }
        
        # Load Config from Commit 1 (New) if exists
        def get_config(directory: Path):
            config_path = directory / ".prism.json"
            if config_path.exists():
                try:
                    return json.loads(config_path.read_text(encoding="utf-8"))
                except Exception as e:
                    job['logs'].append(f"Warning: Failed to parse .prism.json: {e}")
            return {}

        # 1. Snapshot commits
        c1_dir = job_dir / commit1
        c2_dir = job_dir / commit2
        
        job['logs'].append(f"Snapshotting commit {commit1}...")
        _snapshot_commit(project_path, commit1, c1_dir)
        
        job['logs'].append(f"Snapshotting commit {commit2}...")
        _snapshot_commit(project_path, commit2, c2_dir)


        # We need to process both commits to ensure we catch files present in one but not other?
        # For simplicity, we scan both, but usually we iterate over the "New" structure 
        # or we just process both folders independently.
        
        # Define colors
        # Commit 1 (New) = GREEN
        # Commit 2 (Old) = RED
        COLOR_NEW = "#00AA00" # Slightly darker green for visibility on white
        COLOR_OLD = "#FF0000"
        
        # Per-commit sch output dirs, captured for the post-loop union.
        sch_dirs: Dict[str, Path] = {}

        for commit, directory, color in [(commit1, c1_dir, COLOR_NEW), (commit2, c2_dir, COLOR_OLD)]:
            # 1. Locate design files
            # Use the path-config-resolved root so kicad-cli walks the full
            # hierarchy. Picking an arbitrary .kicad_sch via rglob would miss
            # subsheets not reachable from that match.
            main_sch_str = find_schematic_file(str(directory))
            sch_file = Path(main_sch_str) if main_sch_str else None
            if sch_file and not sch_file.exists():
                sch_file = None

            pcb_file = next(directory.rglob("*.kicad_pcb"), None)

            # 2. Export Schematics
            if sch_file:
                sch_out_dir = directory / "sch"
                sch_out_dir.mkdir(exist_ok=True)
                sch_dirs[commit] = sch_out_dir
                job['logs'].append(f"Exporting Schematics for {commit}...")

                cmd = [
                    CLI_CMD, "sch", "export", "svg",
                    "--black-and-white",
                    "--output", str(sch_out_dir),
                    str(sch_file)
                ]
                job['logs'].append(f"SCH CMD: {' '.join(cmd)}")
                res = subprocess.run(cmd, capture_output=True, text=True)

                if res.returncode == 0:
                    for svg in list(sch_out_dir.glob("*.svg")):
                        _colorize_svg(svg, color)
                    if commit == commit1:
                        manifest["schematic"] = True
                else:
                    job['logs'].append(f"SCH Export FAILED (Code {res.returncode})")
            else:
                job['logs'].append(f"No .kicad_sch found for {commit}")
            
            # 3. Export PCB Layers
            if pcb_file:
                pcb_out_dir = directory / "pcb"
                pcb_out_dir.mkdir(exist_ok=True)
                job['logs'].append(f"Exporting PCB Layers for {commit} from {pcb_file}...")
                
                # We export standard layers in one shot using --mode-multi
                all_layers = _get_pcb_layers(pcb_file)
                cmd = [
                    CLI_CMD, "pcb", "export", "svg",
                    "--mode-multi",
                    "--layers", ",".join(all_layers),
                    "--black-and-white",
                    "--exclude-drawing-sheet",
                    "--page-size-mode", "2",
                    "--output", str(pcb_out_dir),
                    str(pcb_file)
                ]
                job['logs'].append(f"PCB CMD: {' '.join(cmd)}")
                res = subprocess.run(cmd, capture_output=True, text=True)
                
                if res.returncode == 0:
                    # KiCad names these {project}-{layer}.svg or just {layer}.svg
                    # We normalize them to {layer_name}.svg for the frontend
                    found_layers = []
                    job['logs'].append(f"PCB Export success. Dir content: {list(pcb_out_dir.glob('*.svg'))}")
                    
                    for svg in list(pcb_out_dir.glob("*.svg")):
                        leaf = svg.name
                        layer_part = leaf
                        if leaf.startswith(pcb_file.stem + "-"):
                            layer_part = leaf[len(pcb_file.stem)+1:]
                        
                        # Match back to the original layer name to ensure F.Cu vs F_Cu consistency
                        matched_layer = None
                        for l in all_layers:
                            if l.replace(".", "_") == layer_part.replace(".svg", ""):
                                matched_layer = l
                                break
                        
                        if matched_layer:
                            target_svg = pcb_out_dir / (matched_layer.replace(".", "_") + ".svg")
                            job['logs'].append(f"Matched {leaf} -> {matched_layer} (Target: {target_svg.name})")
                            if svg.resolve() != target_svg.resolve():
                                if target_svg.exists(): target_svg.unlink()
                                svg.rename(target_svg)
                            
                            _colorize_svg(target_svg, color)
                            found_layers.append(matched_layer)
                        else:
                            job['logs'].append(f"Could not match PCB SVG: {leaf}")
                    
                    if commit == commit1:
                        manifest["layers"] = sorted(list(set(found_layers)))
                        job['logs'].append(f"Populated manifest with {len(manifest['layers'])} layers")
                else:
                    job['logs'].append(f"PCB Export FAILED (Code {res.returncode})")
                    job['logs'].append(f"STDERR: {res.stderr}")
            else:
                job['logs'].append(f"No .kicad_pcb found for {commit}")

        # Publish the union of emitted SVG filenames across both commits, so
        # sheets that exist in only one commit (added/removed) still appear.
        sheet_union: set = set()
        for d in sch_dirs.values():
            sheet_union.update(p.name for p in d.glob("*.svg"))
        if sheet_union:
            manifest["sheets"] = sorted(sheet_union)

        # 4. BoM Diff
        job['logs'].append("Generating BoM Diff...")
        try:
            config = get_config(c1_dir)
            bom_fields = config.get("bom", {}).get("fields", ["Reference", "Value", "Footprint", "Datasheet"])
            
            bom_csvs = {}
            for commit, directory in [(commit1, c1_dir), (commit2, c2_dir)]:
                # Use the path-config-resolved root schematic so kicad-cli can
                # walk the full hierarchy. Picking an arbitrary subsheet here
                # would silently produce a partial BoM.
                main_sch_str = find_schematic_file(str(directory))
                sch_file = Path(main_sch_str) if main_sch_str else None
                if sch_file and sch_file.exists():
                    csv_path = directory / "bom.csv"
                    cmd = [
                        CLI_CMD, "sch", "export", "bom",
                        "--fields", ",".join(bom_fields),
                        "--output", str(csv_path),
                        str(sch_file)
                    ]
                    res = subprocess.run(cmd, capture_output=True, text=True)
                    if res.returncode == 0 and csv_path.exists():
                        bom_csvs[commit] = csv_path.read_text(encoding="utf-8")
                    else:
                        job['logs'].append(f"BoM export failed for {commit}: {res.stderr}")
            
            if commit1 in bom_csvs and commit2 in bom_csvs:
                old_bom = bom_diff_service.parse_bom_csv(bom_csvs[commit2])
                new_bom = bom_diff_service.parse_bom_csv(bom_csvs[commit1])
                diff_results = bom_diff_service.diff_boms(old_bom, new_bom, bom_fields)
                manifest["bom"] = diff_results
                job['logs'].append("BoM Diff generated successfully.")
            else:
                job['logs'].append("Skipping BoM Diff: Could not generate CSVs for both commits.")
                
        except Exception as e:
            job['logs'].append(f"Error generating BoM diff: {e}")

        # Write manifest
        # Write logs and manifest
        log_path = job_dir / "logs.txt"
        log_path.write_text("\n".join(job['logs']), encoding="utf-8")

        with open(job_dir / "manifest.json", "w") as f:
            json.dump(manifest, f, indent=2)

        job['status'] = 'completed'
        job['message'] = 'Ready'
        job['percent'] = 100
        job['logs'].append("Diff generation complete.")
        log_path.write_text("\n".join(job['logs']), encoding="utf-8")

    except Exception as e:
        job['status'] = 'failed'
        job['error'] = str(e)
        job['logs'].append(f"Critical Error: {str(e)}")
        if 'job_dir' in locals() and job_dir.exists():
            (job_dir / "logs.txt").write_text("\n".join(job['logs']), encoding="utf-8")


def start_diff_job(project_id: str, commit1: str, commit2: str) -> str:
    """Start async diff job."""
    job_id = str(uuid.uuid4())
    diff_jobs[job_id] = {
        "status": "running",
        "message": "Initializing...",
        "percent": 0,
        "created_at": time.time(),
        "project_id": project_id,
        "commit1": commit1,
        "commit2": commit2,
        "logs": [],
        "error": None,
        "abs_output_path": None
    }
    
    thread = threading.Thread(
        target=_run_diff_generation,
        args=(job_id, project_id, commit1, commit2)
    )
    thread.daemon = True
    thread.start()
    
    return job_id

def get_job_status(job_id: str) -> Optional[dict]:
    return diff_jobs.get(job_id)

def get_manifest(job_id: str):
    job = diff_jobs.get(job_id)
    if not job or job['status'] != 'completed':
        return None
    
    path = Path(job['abs_output_path']) / "manifest.json"
    if path.exists():
        with open(path, 'r') as f:
            return json.load(f)
    return None

def get_asset_path(job_id: str, asset_path: str) -> Optional[Path]:
    job = diff_jobs.get(job_id)
    if not job or job['status'] != 'completed':
        return None
        
    root = Path(job['abs_output_path'])
    full_path = root / asset_path
    
    # Security check
    try:
        if root in full_path.resolve().parents:
            if full_path.exists():
                return full_path
    except Exception:
        pass
    return None
