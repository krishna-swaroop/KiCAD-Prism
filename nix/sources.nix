{
  lib,
}:
let
  inherit (lib) fileset;
in
{
  version = "0-unstable";

  kicad-prism-viewer = fileset.toSource {
    root = ../kicad-prism-viewer;
    fileset = fileset.difference
      ../kicad-prism-viewer
      ../kicad-prism-viewer/native;
  };

  prism-clipper2 = fileset.toSource {
    root = ../kicad-prism-viewer/native/prism-clipper2;
    fileset = ../kicad-prism-viewer/native/prism-clipper2;
  };

  kicad-prism-frontend = fileset.toSource {
    root = ../frontend;
    fileset = ../frontend;
  };

  kicad-prism = fileset.toSource {
    root = ../.;
    fileset = fileset.unions [
      ../assets/Outputs.kicad_jobset
      ../backend/Dockerfile
      ../backend/app
      ../backend/requirements.txt
      ../backend/tests
      ../docker-compose.yml
      ../fixtures
      ../kicad-prism-viewer/requirements-runtime.txt
      ../requirements
      ../scripts
    ];
  };
}
