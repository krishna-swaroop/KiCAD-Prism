{
  pkgs,
}:
pkgs.mkShellNoCC {
  packages = with pkgs; [
    (python312.withPackages (_: kicad-prism.dependencies))
    kicad
    nodejs
    git
  ];
}
