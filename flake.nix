{
  description = "KiCad Prism — self-hosted PCB review and component governance platform for KiCad";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      nixpkgs,
      ...
    }:
    let
      system = "x86_64-linux";

      overlay = import ./nix/overlay.nix;

      nixosModule = import ./nix/modules/nixos/kicad-prism.nix;

      pkgs = import nixpkgs {
        inherit system;
        overlays = [ overlay ];
      };
    in
    {
      packages.${system} = {
        inherit (pkgs)
          kicad-prism
          kicad-prism-frontend
          kicad-prism-viewer
          prism-clipper2
          ;
        default = pkgs.kicad-prism;
      };

      overlays.default = overlay;

      nixosModules = {
        default = nixosModule;
        kicad-prism = nixosModule;
      };

      devShells.${system}.default = import ./nix/devshell.nix { inherit pkgs; };

      checks.${system} = {
        inherit (pkgs)
          kicad-prism
          kicad-prism-frontend
          kicad-prism-viewer
          prism-clipper2
          ;
      };
    };
}
