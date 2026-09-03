{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.kicad-prism;

  homepage = "https://github.com/krishna-swaroop/KiCAD-Prism";

  databaseUrl =
    if lib.hasPrefix "/" cfg.database.host then
      "postgresql:///${cfg.database.name}?host=${cfg.database.host}"
    else
      "postgresql://${cfg.database.user}@${cfg.database.host}:${toString cfg.database.port}/${cfg.database.name}";

  backendUrl = "http://${
    if lib.hasInfix ":" cfg.address then "[${cfg.address}]" else cfg.address
  }:${toString cfg.port}";

  settingsFile = pkgs.writeText "kicad-prism.env" (
    lib.generators.toKeyValue { } (lib.filterAttrs (_: value: value != null) cfg.settings)
  );

  secretsInStore = lib.filter (name: cfg.settings ? ${name}) [
    "BOOTSTRAP_ADMIN_PASSWORD"
    "GITHUB_TOKEN"
    "OIDC_CLIENT_SECRET"
    "SESSION_SECRET"
  ];

  serviceDefaults = {
    User = cfg.user;
    Group = cfg.group;
    WorkingDirectory = cfg.stateDir;
    EnvironmentFile = [
      settingsFile
    ]
    ++ lib.optional (cfg.environmentFile != null) cfg.environmentFile;
    Restart = "on-failure";
    RestartSec = 5;

    ReadWritePaths = [
      cfg.stateDir
      cfg.projectsDir
    ];

    CapabilityBoundingSet = [ "" ];
    LockPersonality = true;
    NoNewPrivileges = true;
    PrivateDevices = true;
    PrivateTmp = true;
    ProtectClock = true;
    ProtectControlGroups = true;
    ProtectHome = true;
    ProtectHostname = true;
    ProtectKernelLogs = true;
    ProtectKernelModules = true;
    ProtectKernelTunables = true;
    ProtectSystem = "strict";
    RemoveIPC = true;
    RestrictAddressFamilies = [
      "AF_INET"
      "AF_INET6"
      "AF_UNIX"
    ];
    RestrictNamespaces = true;
    RestrictRealtime = true;
    RestrictSUIDSGID = true;
    SystemCallArchitectures = "native";
    # kicad-cli sizes its thread pool with sched_setaffinity/setpriority when it
    # renders PCB thumbnails and exports the 3D GLB, so @resources has to stay
    # allowed -- denying it killed kicad-cli with SIGSYS before it wrote any
    # diagnostics. SystemCallErrorNumber keeps a future violation an errno the
    # caller can report instead of an unexplained signal death.
    SystemCallErrorNumber = "EPERM";
    SystemCallFilter = [
      "@system-service"
      "~@privileged"
    ];
    UMask = "0027";
  }
  // lib.optionalAttrs (cfg.stateDir == "/var/lib/kicad-prism") {
    StateDirectory = "kicad-prism";
    StateDirectoryMode = "0750";
  };

  unit = description: execStart: {
    inherit description;
    documentation = [ homepage ];
    wantedBy = [ "multi-user.target" ];
    environment.HOME = cfg.stateDir;
    serviceConfig = serviceDefaults // {
      ExecStart = execStart;
    };
  };

  worker =
    pool: description:
    unit description "${lib.getExe' cfg.package "kicad-prism-worker"} --pool ${pool}"
    // {
      after = [ "kicad-prism.service" ];
      requires = [ "kicad-prism.service" ];
    };

  ownedDirectory = {
    d = {
      user = cfg.user;
      group = cfg.group;
      mode = "0750";
    };
  };

  proxy = extraConfig: {
    proxyPass = backendUrl;
    proxyWebsockets = true;
    recommendedProxySettings = false;
    extraConfig = ''
      proxy_cache_bypass $http_upgrade;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $prism_forwarded_proto;
      proxy_set_header X-Forwarded-Host $host;
      ${extraConfig}
    '';
  };
in
{
  options.services.kicad-prism = {
    enable = lib.mkEnableOption "KiCad Prism, a review and component governance platform for KiCad projects tracked in Git";

    package = lib.mkPackageOption pkgs "kicad-prism" { };

    user = lib.mkOption {
      type = lib.types.str;
      default = "kicad-prism";
      description = ''
        System user the API and both workers run as, and the owner of everything
        under {option}`services.kicad-prism.stateDir`. It must also be the
        PostgreSQL role name when
        {option}`services.kicad-prism.database.createLocally` is enabled, because
        the local connection authenticates with peer authentication.
      '';
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "kicad-prism";
      description = ''
        Group owning the state and project directories. nginx is added to it so
        that it can serve project files handed to it through an internal redirect.
      '';
    };

    stateDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/kicad-prism";
      description = ''
        Directory holding all writable state, and the home directory of the service
        user: the deploy keys and `known_hosts` used to clone project repositories
        are read from `.ssh` inside it.
      '';
    };

    projectsDir = lib.mkOption {
      type = lib.types.str;
      default = "${cfg.stateDir}/projects";
      defaultText = lib.literalExpression ''"''${config.services.kicad-prism.stateDir}/projects"'';
      description = ''
        Directory holding the cloned project repositories, the rendered artifacts
        and the component catalog storage. It grows with every imported repository
        and every generated board render.
      '';
    };

    address = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = ''
        Address the API listens on. Keep it on the loopback interface and let nginx
        terminate client connections: the API trusts the `X-Forwarded-*` headers it
        receives.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8000;
      description = ''
        TCP port the API listens on. This is the port nginx proxies to, not the one
        users connect to.
      '';
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/kicad-prism.env";
      description = ''
        Path to a file of `KEY=value` lines loaded into all three units at startup
        and never copied into the Nix store. Every secret belongs here:
        `SESSION_SECRET`, `OIDC_CLIENT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`,
        `GITHUB_TOKEN`, and the full `PRISM_DATABASE_URL` when the database is not
        created locally.

        It is loaded after the file generated from
        {option}`services.kicad-prism.settings`, so a variable set in both places
        takes its value from here.
      '';
    };

    database = {
      createLocally = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Whether to provision a PostgreSQL database on this machine and reach it
          over the unix socket with peer authentication, so that no password exists
          anywhere. Disable this to use an external server and supply a complete
          `PRISM_DATABASE_URL` through
          {option}`services.kicad-prism.environmentFile`.
        '';
      };

      host = lib.mkOption {
        type = lib.types.str;
        default = "/run/postgresql";
        example = "db.example.org";
        description = ''
          PostgreSQL host. A value starting with `/` is the directory holding the
          unix socket and yields a password-less connection string; anything else is
          a hostname, to which you still have to add a password through
          {option}`services.kicad-prism.environmentFile`.
        '';
      };

      port = lib.mkOption {
        type = lib.types.port;
        default = 5432;
        description = ''
          PostgreSQL port, ignored when {option}`services.kicad-prism.database.host`
          is a unix socket directory.
        '';
      };

      name = lib.mkOption {
        type = lib.types.str;
        default = "kicad-prism";
        description = ''
          Name of the database. Its schema is created by the API on first start;
          there is no separate migration step.
        '';
      };

      user = lib.mkOption {
        type = lib.types.str;
        default = "kicad-prism";
        description = ''
          PostgreSQL role KiCad Prism connects as. It is created and made owner of
          the database when
          {option}`services.kicad-prism.database.createLocally` is enabled, and then
          has to match {option}`services.kicad-prism.user`.
        '';
      };
    };

    nginx = {
      enable = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = ''
          Whether to serve the single-page frontend and reverse-proxy the API.
          Disable this only to put a different web server in front: the bundle is
          static and expects `/api/`, `/oauth/` and `/remote-provider/` to reach the
          backend on the same origin.
        '';
      };

      serverName = lib.mkOption {
        type = lib.types.str;
        default = "kicad-prism";
        example = "prism.example.org";
        description = ''
          Name of the nginx virtual host to create. Configure TLS on it through
          {option}`services.nginx.virtualHosts` as usual, and use the same name in
          `PUBLIC_BASE_URL` and `CORS_ORIGINS_STR`.
        '';
      };
    };

    settings = lib.mkOption {
      type = lib.types.attrsOf (
        lib.types.nullOr (
          lib.types.oneOf [
            lib.types.bool
            lib.types.int
            lib.types.str
          ]
        )
      );
      default = { };
      example = {
        BOOTSTRAP_ADMIN_USERS_STR = "admin@example.org";
        PUBLIC_BASE_URL = "https://prism.example.org";
        CORS_ORIGINS_STR = "https://prism.example.org";
        IMPORT_ALLOWED_HOSTS_STR = "git.example.org";
      };
      description = ''
        Environment variables configuring KiCad Prism, written to a file in the Nix
        store and loaded by all three units. The full list and the defaults are in
        `backend/.env.example` upstream; only the variables that interact with the
        rest of this module have dedicated options here. A value of `null` removes a
        variable the module would otherwise set, and booleans are rendered as `true`
        and `false`, which is what the application expects.

        The Nix store is world-readable, so never put a secret here. Secrets belong
        in {option}`services.kicad-prism.environmentFile`, which is loaded afterwards
        and therefore overrides this option.

        Local email and password login is enabled by default, so a deployment needs
        no identity provider. Seed the first account with `BOOTSTRAP_ADMIN_USERS_STR`
        and a one-time `BOOTSTRAP_ADMIN_PASSWORD`, and clear the password once that
        administrator has chosen their own. Setting `OIDC_ISSUER_URL`,
        `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` adds single sign-on alongside it;
        `PASSWORD_AUTH_ENABLED = false` then leaves it as the only way in.

        Setting `AUTH_ENABLED = false` serves every request as an anonymous guest
        with no login at all. It is meant for evaluating the application on a machine
        nobody else can reach, and the application refuses to start that way once
        `PUBLIC_BASE_URL` names a routable HTTPS origin.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.database.createLocally -> cfg.database.user == cfg.user;
        message = ''
          services.kicad-prism.database.user must equal services.kicad-prism.user
          when database.createLocally is enabled, because the local connection uses
          peer authentication over the unix socket.
        '';
      }
      {
        assertion = cfg.database.createLocally || cfg.environmentFile != null;
        message = ''
          services.kicad-prism.database.createLocally is disabled, so
          services.kicad-prism.environmentFile must be set and must define a
          PRISM_DATABASE_URL that includes the credentials for the external
          PostgreSQL server.
        '';
      }
    ];

    warnings = lib.optional (secretsInStore != [ ]) ''
      services.kicad-prism.settings contains ${lib.concatStringsSep ", " secretsInStore},
      which is written to a world-readable file in the Nix store. Move it to
      services.kicad-prism.environmentFile.
    '';

    services.kicad-prism.settings = {
      KICAD_PROJECTS_ROOT = lib.mkDefault cfg.projectsDir;
      PRISM_DATABASE_URL = lib.mkDefault databaseUrl;
      DEV_MODE = lib.mkDefault false;
      GIT_SCAN_KNOWN_HOSTS_ON_STARTUP = lib.mkDefault false;
      PASSWORD_AUTH_ENABLED = lib.mkDefault true;
    };

    services.postgresql = lib.mkIf cfg.database.createLocally {
      enable = true;
      ensureDatabases = [ cfg.database.name ];
      ensureUsers = [
        {
          name = cfg.database.user;
          ensureDBOwnership = true;
        }
      ];
    };

    environment.etc."prism/kicad-base-image".text = "${cfg.package.kicad}\n";

    systemd.tmpfiles.settings."10-kicad-prism" = {
      ${cfg.stateDir} = ownedDirectory;
      ${cfg.projectsDir} = ownedDirectory;
    };

    systemd.services = {
      kicad-prism =
        unit "KiCad Prism API" "${lib.getExe' cfg.package "kicad-prism-server"} --host ${cfg.address} --port ${toString cfg.port}"
        // {
          after = [
            "network-online.target"
          ]
          ++ lib.optional cfg.database.createLocally "postgresql.target";
          requires = lib.optional cfg.database.createLocally "postgresql.target";
          wants = [ "network-online.target" ];
        };

      kicad-prism-worker = worker "prism" "KiCad Prism job worker";

      kicad-prism-catalog-worker = worker "catalog" "KiCad Prism component catalog worker";
    };

    services.nginx = lib.mkIf cfg.nginx.enable {
      enable = true;
      commonHttpConfig = ''
        map $http_x_forwarded_proto $prism_forwarded_proto {
            default $http_x_forwarded_proto;
            ""      $scheme;
        }
      '';
      virtualHosts.${cfg.nginx.serverName} = {
        root = "${cfg.package.frontend}/share/kicad-prism/frontend";
        locations = {
          "/" = {
            index = "index.html";
            tryFiles = "$uri $uri/ /index.html";
          };

          "= /healthz".extraConfig = ''
            access_log off;
            default_type text/plain;
            return 200 "ok\n";
          '';

          "~ ^/(ecad-viewer|prism-semantic-viewer)\\.js$".extraConfig = ''
            add_header Cache-Control "no-cache" always;
            try_files $uri =404;
          '';

          "/api/" = proxy ''
            client_max_body_size 2g;
            client_body_timeout 3600s;
            proxy_request_buffering off;
            proxy_read_timeout 300s;
          '';

          "/oauth/" = proxy "";

          "/remote-provider/" = proxy "";

          "= /.well-known/kicad-remote-provider" = proxy "";

          "/_protected_projects/".extraConfig = ''
            internal;
            alias ${cfg.projectsDir}/;
            add_header X-Content-Type-Options "nosniff" always;
          '';
        };
      };
    };

    users.users = lib.mkMerge [
      (lib.mkIf (cfg.user == "kicad-prism") {
        kicad-prism = {
          description = "KiCad Prism service user";
          isSystemUser = true;
          group = cfg.group;
          home = cfg.stateDir;
        };
      })
      (lib.mkIf cfg.nginx.enable {
        ${config.services.nginx.user}.extraGroups = [ cfg.group ];
      })
    ];

    users.groups = lib.mkIf (cfg.group == "kicad-prism") {
      kicad-prism = { };
    };
  };
}
