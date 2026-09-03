{
  lib,
  python312Packages,
  makeWrapper,
  writeText,
  git,
  gnutar,
  kicad,
  nodejs,
  openssh,
  kicad-prism-frontend,
  kicad-prism-viewer,
  prism-clipper2,
  sources,
}:

let
  inherit (python312Packages) makePythonPath python;

  viewerRoot = "${kicad-prism-viewer}/share/kicad-prism-viewer";

  toolchainPath = lib.makeBinPath [
    git
    gnutar
    kicad
    nodejs
    openssh
    python
    python312Packages.kicad-cruncher
  ];

  installCheckScript = writeText "kicad-prism-install-check.py" ''
    import app.main
    from app.release_studio.steps import resolve_cli_path, resolve_cruncher_path
    from app.services import password_credential_service

    print(app.main.app.title)

    for resolve in (resolve_cli_path, resolve_cruncher_path):
        print(resolve())
  '';
in
python312Packages.buildPythonApplication rec {
  pname = "kicad-prism";
  version = sources.version;
  pyproject = false;

  src = sources.kicad-prism;

  nativeBuildInputs = [ makeWrapper ];

  dependencies =
    with python312Packages;
    [
      bcrypt
      cairosvg
      fastapi
      fonttools
      gitpython
      kicad-cruncher
      kicad-monkey
      kiutils
      pikepdf
      pillow
      psycopg
      psycopg-pool
      pydantic
      pydantic-settings
      pypdf
      python-dotenv
      python-multipart
      pyjwt
      pyyaml
      requests
      uvicorn
    ]
    ++ pyjwt.optional-dependencies.crypto;

  dontWrapPythonPrograms = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/${python.sitePackages}/app/static
    cp -r backend/app/. $out/${python.sitePackages}/app

    install -Dm444 -t $out/${python.sitePackages}/scripts \
      scripts/ecad-diff.mjs scripts/ecad-parse.mjs
    cp -r scripts/vendor $out/${python.sitePackages}/scripts/vendor

    cp -r ${kicad-prism-frontend}/share/kicad-prism/remote-provider \
      $out/${python.sitePackages}/app/static/remote_provider

    local -a wrapperArgs=(
      --prefix PATH : ${toolchainPath}
      --prefix PYTHONPATH : "$out/${python.sitePackages}:${makePythonPath dependencies}"
      --set-default PRISM_SEMANTIC_VIEWER_REPO ${viewerRoot}
      --set-default PRISM_CLIPPER2_LIBRARY ${prism-clipper2}/lib/libprism_clipper2.so
    )

    makeWrapper ${python.interpreter} $out/bin/kicad-prism-server \
      --add-flags "-m uvicorn app.main:app" "''${wrapperArgs[@]}"
    makeWrapper ${python.interpreter} $out/bin/kicad-prism-worker \
      --add-flags "-m app.prism_worker" "''${wrapperArgs[@]}"

    runHook postInstall
  '';

  doInstallCheck = true;

  installCheckPhase = ''
    runHook preInstallCheck

    $out/bin/kicad-prism-worker --help > /dev/null

    PATH=${toolchainPath} \
    PYTHONPATH="$out/${python.sitePackages}:${makePythonPath dependencies}" \
    AUTH_ENABLED=false \
      ${python.interpreter} ${installCheckScript} > /dev/null

    (
      cd backend
      PATH=${toolchainPath} \
      PYTHONPATH="${makePythonPath dependencies}" \
      AUTH_ENABLED=false \
        ${python.interpreter} -m unittest discover -s tests -p "test_*.py"
    )

    runHook postInstallCheck
  '';

  passthru.frontend = kicad-prism-frontend;
  passthru.kicad = kicad;

  meta = {
    description = "Self-hosted PCB review and component governance platform for KiCad";
    homepage = "https://github.com/krishna-swaroop/KiCAD-Prism";
    license = lib.licenses.asl20;
    maintainers = with lib.maintainers; [ ];
    mainProgram = "kicad-prism-server";
    platforms = lib.platforms.linux;
  };
}
