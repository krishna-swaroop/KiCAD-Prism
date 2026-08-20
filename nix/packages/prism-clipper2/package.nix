{
  lib,
  stdenv,
  cmake,
  sources,
}:

stdenv.mkDerivation (finalAttrs: {
  pname = "prism-clipper2";
  version = sources.version;

  src = sources.prism-clipper2;

  nativeBuildInputs = [ cmake ];

  doCheck = true;

  installPhase = ''
    runHook preInstall

    install -Dm555 libprism_clipper2${stdenv.hostPlatform.extensions.sharedLibrary} -t $out/lib

    runHook postInstall
  '';

  meta = {
    description = "Native Clipper2 polygon clipping library for the KiCad Prism topology compiler";
    homepage = "https://github.com/krishna-swaroop/KiCAD-Prism";
    license = with lib.licenses; [
      asl20
      boost
    ];
    maintainers = with lib.maintainers; [ ];
    platforms = lib.platforms.unix;
  };
})
