# KiCAD Prism

KiCAD Prism is a modern web-based platform for visualizing and managing KiCAD projects. It provides integrated tools for schematic viewing, PCB visualization (2D/3D), interactive BOMs, collaborative design reviews, and automated output generation workflows.

![KiCAD Prism Screenshot](assets/screenshot.png)

## Features

### Core Functionality

- **Project Explorer**: Browse and manage multiple KiCAD projects.
- **Async GitHub Import**: Import repositories directly from GitHub with real-time progress tracking.
- **Repository Sync**: Pull latest changes from remote repositories with one click.

### Visualization

- **Project Visualizer**:
  - High-performance Schematic and PCB viewing powered by [ecad-viewer](https://github.com/Huaqiu-Electronics/ecad-viewer).
  - Integrated 3D model viewer.
  - Interactive BoM (iBoM) support.

### Collaboration

- **Design Review Comments**: Add contextual comments directly on schematic symbols and PCB footprints.
- **Threaded Discussions**: Reply to comments and mark them as resolved.
- **Comment Overlays**: Visual pins show comment locations on the design.

### Documentation & History

- **Assets Portal**: Explore design and manufacturing outputs.
- **Documentation Browser**: View markdown documentation within the project.
- **History Viewer**: View git commit history and browse files at specific points in time.

### Automation

- **Workflow Automation**: Trigger `kicad-cli` jobs to generate latest design/manufacturing outputs and ray-traced renders directly from the browser.
- **Git Integration**: Automated committing and pushing of generated outputs to remote repositories.

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, ShadCN UI, Lucide Icons.
- **Backend**: FastAPI (Python 3.10+), GitPython.
- **Tools**: `kicad-cli` (v8.0+ or v9.0+).

---

## Getting Started

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions on setting up the platform.  
For the expected structure of imported KiCAD projects, see [KICAD-PRJ-REPO-STRUCTURE.md](./KICAD-PRJ-REPO-STRUCTURE.md).

### Quick Start

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

For instantiating the frontend, run:

```bash
$KiCAD-Prism$ cd frontend
npm install
npm run dev
```

---

## Authentication

KiCAD Prism supports optional Google Sign-in with domain restrictions.

### Configuration Options

| Mode | GOOGLE_CLIENT_ID | DEV_MODE | Behavior |
|------|------------------|----------|----------|
| **Public Gallery** | Empty | Any | No login required, users see gallery directly |
| **Development** | Set | True | Login page shown with Dev Bypass button |
| **Production** | Set | False | Full authentication required |

### Domain Restrictions

You can restrict access to specific Google Workspace domains:

```bash
# In backend/.env
ALLOWED_DOMAINS_STR=pixxel.co.in,spacepixxel.in
```

See [DEPLOYMENT.md](./DEPLOYMENT.md#authentication-setup) for complete authentication setup instructions.

---

## Project Structure

```text
KiCAD-Prism/
├── backend/            # FastAPI backend
│   ├── app/            # Application logic
│   │   ├── api/        # API endpoints
│   │   ├── core/       # Configuration
│   │   └── services/   # Business logic
│   ├── .env.example    # Environment template
│   └── requirements.txt
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── pages/      # Page components
│   │   └── lib/        # Utilities
│   ├── .env.example    # Environment template
│   └── package.json
└── assets/             # Static assets
```

---

## Workflow Requirements

1. **Jobset File**: You **must** have a file named `Outputs.kicad_jobset` in the root of your project.
2. **Output IDs**: The KiCAD Prism platform currently uses specific UUIDs for job execution. Ensure your jobset has outputs with these identifiers if you are using custom templates:
    - **Design**: `28dab1d3-7bf2-4d8a-9723-bcdd14e1d814`
    - **Manufacturing**: `9e5c254b-cb26-4a49-beea-fa7af8a62903`
    - **Render**: `81c80ad4-e8b9-4c9a-8bed-df7864fdefc6`

> **Note**: Feel free to customize the jobset file for your needs. This was a last-minute addition and will be improved for better flexibility. For now, use the jobset file in `assets/` or modify the workflow in `project_service.py`.

1. **Relative Paths**: Always use relative paths for subsheets (`Subsheets/file.kicad_sch`) and 3D models to ensure portability.

---

## Customization

### Theme Colors (ShadCN UI)

The application uses ShadCN UI for components, which can be customized via CSS variables.

1. Open `frontend/src/index.css`.
2. Locate the `:root` (for light mode) or `.dark` (for dark mode) blocks.
3. Update the HSL values for the desired variables.

**Example: Changing the Primary Color**

```css
:root {
  --primary: 221.2 83.2% 53.3%; /* HSL values without brackets */
}
```

You can use the [ShadCN UI Themes](https://ui.shadcn.com/themes) gallery to generate new color palettes.

---

## Roadmap

### ✅ Completed

- [x] Project Explorer & GitHub Import
- [x] Schematic, PCB, 3D, and iBoM Viewers
- [x] Workflow Automation (Design, Manufacturing, Renders)
- [x] Design Review Comments
- [x] Repository Sync Feature
- [x] Optional Authentication with Domain Restrictions

### 🚧 In Progress

- [ ] Generic Workflows (user-defined jobset configurations)
- [ ] Visual Git Diff (integrating [Kiri](https://github.com/leoheck/kiri))

### 📋 Planned

- [ ] User permissions and access control
- [ ] Real-time collaboration (WebSocket-based)
- [ ] Component library browser
- [ ] Design rule check (DRC) integration

---

## Acknowledgements

KiCAD Prism is built upon several amazing open-source projects:

- **[ecad-viewer](https://github.com/Huaqiu-Electronics/ecad-viewer)** - Schematic and PCB rendering.
- **[Three.js](https://threejs.org/)** - 3D computer graphics.
- **[FastAPI](https://fastapi.tiangolo.com/)** - Backend web framework.
- **[React](https://reactjs.org/)** - Frontend UI library.
- **[Tailwind CSS](https://tailwindcss.com/)** & **[ShadCN UI](https://ui.shadcn.com/)** - Styling and components.
- **[Lucide Icons](https://lucide.dev/)** - Toolkit-neutral icons.
- **[GitPython](https://gitpython.readthedocs.io/)** - Interaction with git repositories.
- **[React Markdown](https://github.com/remarkjs/react-markdown)** - Markdown rendering.

Special thanks to the KiCAD team and the open-source hardware community.

---

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.
