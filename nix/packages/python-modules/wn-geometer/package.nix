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
      platform = "manylinux_2_35_x86_64";
      hash = "sha256-xXs78Yru4SWj8HRsY7SmnQlyFFQ+e9Hr4lSaEqGt8Hs=";
    };
    aarch64-linux = {
      platform = "manylinux_2_35_aarch64";
      hash = "sha256-JLwKBe9QbtKglqzxwJ6pWXQ6DtPSQnTWiyD9DfsjbH4=";
    };
    aarch64-darwin = {
      platform = "macosx_11_0_arm64";
      hash = "sha256-PdvYu+tZGyKBSBCgxc+jBu9RHr22y4VCSk/qRba3Ajk=";
    };
  };
  wheel =
    wheels.${stdenv.hostPlatform.system}
      or (throw "wn-geometer: no wheel for ${stdenv.hostPlatform.system}");
in
buildPythonPackage {
  pname = "wn-geometer";
  version = "2026.8.21";
  format = "wheel";

  disabled = pythonOlder "3.10";

  src = fetchPypi {
    pname = "wn_geometer";
    version = "2026.8.21";
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
    changelog = "https://github.com/wavenumber-eng/geometer/blob/v2026-08-21/CHANGELOG.md";
    license = lib.licenses.mit;
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
    maintainers = with lib.maintainers; [ ];
    mainProgram = "geometer";
    platforms = lib.attrNames wheels;
  };
}
