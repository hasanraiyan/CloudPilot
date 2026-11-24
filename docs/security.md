# CloudPilot Security Advisory Resolution

## Advisory

GitHub advisory `GHSA-7589-6fvf-x4pw` reports a ReDoS vulnerability in
`Schema.TemplateLiteral` in `effect` versions through `3.22.0`.

The affected package chain in the current Prisma 7 dependency set is:

```text
@cloudpilot/database
-> prisma@7.10.1
-> @prisma/config@7.10.1
-> effect@3.20.0
```

The candidate patched Effect release is `3.22.5`.

## Root Cause

`@prisma/config@7.10.1` declares the exact dependency `effect@3.20.0`.
The installed Prisma 7 stable release does not contain a compatible newer Effect
dependency. Both global and package-scoped npm overrides were unable to re-resolve
the exact dependency. Targeted lockfile-only resolution and clean lockfile
regeneration also retained `effect@3.20.0`.

There is no Prisma 7.10.2 stable package that updates this dependency at this time.
Prisma 8 release candidates are outside the supported resolution path for this
project.

## Resolution Decision

The ineffective override was removed and the working Prisma 7.10.1 dependency
configuration was restored. Prisma CLI, Prisma Client, and `@prisma/adapter-pg`
remain aligned at `7.10.1`.

`npm audit fix --force` was not used because it proposes a breaking downgrade to
Prisma 6.12.0.

## Compatibility Testing

After resolution, verify:

- `npm ls effect`
- `npm explain effect`
- `npm audit`
- `npm audit --omit=dev`
- Prisma format, validate, generate, and migration status
- Database, API, and frontend builds
- PostgreSQL readiness and liveness

## Override Removal Criteria

An Effect override may be reconsidered only when a compatible stable Prisma release
publishes an upgrade that does not require a major version change. Verify the actual
installed dependency tree and audit result; package-manifest overrides alone are not
evidence of a fix.

## Residual Risk

The monorepo currently retains three high-severity audit findings associated with
the Effect package chain. This is a residual upstream dependency risk until a
stable Prisma/Prisma-config release that uses a patched Effect version is available.
