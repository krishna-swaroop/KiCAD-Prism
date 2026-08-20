final: prev:
let
  inherit (prev) lib;

  sources = import ./sources.nix { inherit lib; };
in
{
  pythonPackagesExtensions = prev.pythonPackagesExtensions ++ [
    (pyfinal: pyprev: {
      inline-snapshot = pyprev.inline-snapshot.overridePythonAttrs (_: { doCheck = false; });
      kiutils = pyfinal.callPackage ./packages/python-modules/kiutils/package.nix { };
      kicad-monkey = pyfinal.callPackage ./packages/python-modules/kicad-monkey/package.nix { };
      kicad-cruncher = pyfinal.callPackage ./packages/python-modules/kicad-cruncher/package.nix { };
      wn-geometer = pyfinal.callPackage ./packages/python-modules/wn-geometer/package.nix { };
    })
  ];

  kicad-prism-frontend = final.callPackage ./packages/kicad-prism-frontend/package.nix {
    inherit sources;
  };

  kicad-prism-viewer = final.callPackage ./packages/kicad-prism-viewer/package.nix {
    inherit sources;
  };

  prism-clipper2 = final.callPackage ./packages/prism-clipper2/package.nix {
    inherit sources;
  };

  kicad-prism = final.callPackage ./packages/kicad-prism/package.nix {
    inherit sources;
  };
}
