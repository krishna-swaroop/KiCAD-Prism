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
  uvicorn,
  wn-geometer,
}:

buildPythonPackage rec {
  pname = "kicad-cruncher";
  version = "2026.6.13";
  pyproject = true;

  disabled = pythonOlder "3.11" || pythonAtLeast "3.13";

  src = fetchPypi {
    pname = "kicad_cruncher";
    inherit version;
    hash = "sha256-xSIpbgO30rlfTRDh+sUByHf5U8TQxC66SjGkk1TWDCk=";
  };

  build-system = [ hatchling ];

  dependencies = [
    colorama
    fastapi
    kicad-monkey
    openpyxl
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
