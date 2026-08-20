{
  lib,
  stdenv,
  buildPythonPackage,
  fetchPypi,
  pythonOlder,
  autoPatchelfHook,
}:

let
  wheels = {
    x86_64-linux = {
      platform = "manylinux_2_39_x86_64";
      hash = "sha256-4UUEiUQD9Syua9ecnApWEDSUY4VVuiMW69M+2O71xN4=";
    };
    aarch64-linux = {
      platform = "manylinux_2_39_aarch64";
      hash = "sha256-z1D3CIK56x4hueDFO6CmRmcnDJCYGTHA3I+2GS7tcZo=";
    };
    aarch64-darwin = {
      platform = "macosx_11_0_arm64";
      hash = "sha256-//QeuICzpJPhsB7PTHLWtA4KbWr+sszvCY35uozi1SI=";
    };
  };
  wheel =
    wheels.${stdenv.hostPlatform.system}
      or (throw "wn-geometer: no wheel for ${stdenv.hostPlatform.system}");
in
buildPythonPackage {
  pname = "wn-geometer";
  version = "2026.6.10";
  format = "wheel";

  disabled = pythonOlder "3.10";

  src = fetchPypi {
    pname = "wn_geometer";
    version = "2026.6.10";
    inherit (wheel) platform hash;
    format = "wheel";
    dist = "py3";
    python = "py3";
    abi = "none";
  };

  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [ autoPatchelfHook ];

  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  pythonImportsCheck = [ "geometer" ];

  meta = {
    description = "Python bindings for Geometer CAD geometry operations";
    homepage = "https://github.com/wavenumber-eng/geometer";
    changelog = "https://github.com/wavenumber-eng/geometer/blob/v2026-06-10/CHANGELOG.md";
    license = lib.licenses.mit;
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
    maintainers = with lib.maintainers; [ ];
    mainProgram = "geometer";
    platforms = lib.attrNames wheels;
  };
}
