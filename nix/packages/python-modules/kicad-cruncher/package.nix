{
  lib,
  buildPythonPackage,
  fetchPypi,
  pythonAtLeast,
  pythonOlder,
  hatchling,
  colorama,
  fastapi,
  kicad-monkey,
  openpyxl,
  textual,
  uvicorn,
  wn-geometer,
}:

buildPythonPackage rec {
  pname = "kicad-cruncher";
  version = "2026.8.22";
  pyproject = true;

  disabled = pythonOlder "3.11" || pythonAtLeast "3.13";

  src = fetchPypi {
    pname = "kicad_cruncher";
    inherit version;
    hash = "sha256-urxEm8OlDyJIePH4bYgTUUhuyv/b0wUepSMsZL+ubQM=";
  };

  build-system = [ hatchling ];

  dependencies = [
    colorama
    fastapi
    kicad-monkey
    openpyxl
    textual
    uvicorn
    wn-geometer
  ];

  pythonImportsCheck = [ "kicad_cruncher" ];

  meta = {
    description = "Cross-platform KiCad CLI workflows built on public kicad-monkey";
    homepage = "https://github.com/wavenumber-eng/kicad_cruncher";
    changelog = "https://github.com/wavenumber-eng/kicad_cruncher/blob/v${version}/CHANGELOG.md";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [ ];
    mainProgram = "kicad-cruncher";
    platforms = wn-geometer.meta.platforms;
  };
}
