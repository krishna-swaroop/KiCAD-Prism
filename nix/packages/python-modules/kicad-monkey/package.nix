{
  lib,
  buildPythonPackage,
  fetchPypi,
  pythonAtLeast,
  pythonOlder,
  hatchling,
  colorama,
  freetype-py,
  msgspec,
  numpy,
  shapely,
  trimesh,
  uharfbuzz,
  zstandard,
}:

buildPythonPackage rec {
  pname = "kicad-monkey";
  version = "2026.8.22";
  pyproject = true;

  disabled = pythonOlder "3.11" || pythonAtLeast "3.13";

  src = fetchPypi {
    pname = "kicad_monkey";
    inherit version;
    hash = "sha256-KkGK/tdMopXrjJda5Ens4wLlWbOcnq1NbwmKYm7F21w=";
  };

  build-system = [ hatchling ];

  dependencies = [
    colorama
    freetype-py
    msgspec
    numpy
    shapely
    trimesh
    uharfbuzz
    zstandard
  ];

  pythonImportsCheck = [ "kicad_monkey" ];

  meta = {
    description = "Core KiCad parser, round-trip, and 2D rendering tooling";
    homepage = "https://github.com/wavenumber-eng/kicad_monkey";
    changelog = "https://github.com/wavenumber-eng/kicad_monkey/blob/v${version}/CHANGELOG.md";
    license = lib.licenses.mit;
    maintainers = with lib.maintainers; [ ];
  };
}
