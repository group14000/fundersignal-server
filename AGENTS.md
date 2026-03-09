# Agent Rules for FounderSignal Server

## Environment File Policy

Do not create `.env.example` files. Only `.env` is required and sufficient for this project.

## NestJS Generation Policy

When creating any new NestJS element supported by `nest generate`, always use Nest CLI scaffolding commands from the project root.

Do not manually create Nest-generated files directly when an official schematic exists.

Use:

```powershell
nest generate <schematic> <name> [path]
```

Short form is allowed:

```powershell
nest g <schematic> <name> [path]
```

Examples (not exhaustive):

```powershell
nest g module users
nest g controller users
nest g service users
nest g provider cache
nest g guard auth
nest g interceptor logging
nest g pipe validation
nest g middleware request-logger
nest g resolver user
nest g resource post
```

### Notes

- Run commands in `C:\Users\hp\OneDrive\Documents\github\FounderSignal\fundersignal-server`.
- Respect requested options when provided (for example: `--no-spec`, `--flat`, `--project`).
- This applies to all schematics available under `nest generate --help` (for example: module, controller, service, provider, guard, interceptor, pipe, middleware, resolver, resource, class, decorator, filter, interface, and others listed by the CLI).
- If a user asks for any Nest element that has a schematic, scaffold with CLI first, then modify generated files as needed.
- Only create files manually when no suitable Nest schematic exists.
