{
  lib,
  buildPythonPackage,
  fetchPypi,
  pythonOlder,
  setuptools,
}:

buildPythonPackage rec {
  pname = "kiutils";
  version = "1.4.8";
  pyproject = true;

  disabled = pythonOlder "3.7";

  src = fetchPypi {
    inherit pname version;
    hash = "sha256-GMWAMoPlec/odylV53AlSNcTng/GMNqlee1rK3Z9uEY=";
  };

  build-system = [ setuptools ];

  pythonImportsCheck = [ "kiutils" ];

  meta = {
    description = "Simple and SCM-friendly KiCad file parser for KiCad 6.0 and up";
    homepage = "https://github.com/mvnmgrx/kiutils";
    changelog = "https://github.com/mvnmgrx/kiutils/blob/v${version}/CHANGELOG.md";
    license = lib.licenses.gpl3Only;
    maintainers = with lib.maintainers; [ ];
  };
}
