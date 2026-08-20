{
  lib,
  buildNpmPackage,
  importNpmLock,
  sources,
}:

buildNpmPackage (finalAttrs: {
  pname = "kicad-prism-viewer";
  version = sources.version;

  src = sources.kicad-prism-viewer;

  npmDeps = importNpmLock {
    npmRoot = sources.kicad-prism-viewer;
  };
  npmConfigHook = importNpmLock.npmConfigHook;

  npmBuildScript = "build";

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share
    cp -a . $out/share/kicad-prism-viewer
    rm -rf $out/share/kicad-prism-viewer/native

    runHook postInstall
  '';

  passthru.semanticViewerBundle = "${finalAttrs.finalPackage}/share/kicad-prism-viewer/dist/prism-semantic-viewer.js";

  meta = {
    description = "Semantic viewer and topology compiler runtime for KiCad Prism";
    homepage = "https://github.com/krishna-swaroop/KiCAD-Prism";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [ ];
    platforms = lib.platforms.all;
  };
})
