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
      ../backend/app
      ../scripts/ecad-diff.mjs
      ../scripts/ecad-parse.mjs
      ../scripts/vendor
    ];
  };
}
