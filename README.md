# node2rpm

Node package that wraps the `rpmbuild` CLI to build RPMs from JavaScript/TypeScript (e.g. packaging Node apps).

**Requirements:** Node.js >= 22. The system **rpmbuild** binary must be installed.

## Prerequisites

Install the RPM toolchain on your system. The package invokes the `rpmbuild` command.

- **macOS:** `brew install rpm`
- **Fedora / RHEL:** `rpm-build` is usually present; if not: `dnf install rpm-build`
- **Debian / Ubuntu:** `apt install rpm`

## Installation

The package is published on the public npm registry as **node2rpm**.

```bash
npm install --save node2rpm
```

## Usage

The package is ESM-only. Use async/await or `.then()`.

### Simple: `build()` (promise)

```javascript
import rpm from 'node2rpm';

const ctx = await rpm.build({
  name: 'myproject',
  version: '0.0.1',
  summary: 'My Project RPM',
  description: 'RPM for my Node project',
  files: {
    '/var/local/myproject': ['lib/**', 'node_modules/**'],
    '/usr/bin': ['bin/**'],
  },
  release: 1,
  url: 'https://myproject/',
  license: 'GPL+',
  group: 'Development/Tools',
  cwd: '.',
  rpmRootDir: './rpmbuild',
});

console.log('RPM built:', ctx.rpms?.rpm);
```

### With `RpmBuilder` (events / multiple builds)

```javascript
import { RpmBuilder } from 'node2rpm';

const builder = new RpmBuilder();
builder.on('message', (phase, ...args) => console.log(phase, ...args));

const ctx = await builder.build({
  name: 'myproject',
  version: '0.0.1',
  summary: 'My Project RPM',
  description: 'RPM for my Node project',
  files: {
    '/var/local/myproject': ['dist/**', 'node_modules/**'],
    '/usr/bin': ['bin/**'],
  },
  release: 20250302120000,
  rpmRootDir: './rpmbuild',
});
```

## API

### `build(options: BuildOptions): Promise<BuildContext>`

Builds an RPM. Options:

| Option          | Type     | Description |
|-----------------|----------|-------------|
| `name`          | string   | Package name |
| `version`       | string   | Version |
| `summary`       | string?  | Short summary |
| `description`   | string?  | Long description |
| `files`         | object   | Map of install path → glob(s). Values can be a string, string[], or `{ path, chmod? }`. Use `!pattern` to exclude |
| `release`       | number?  | Release number (default: 1) |
| `installScript` | string[]?| Script lines for %install (e.g. `chown`); `%{buildroot}` is supported |
| `url`           | string?  | Project URL |
| `license`       | string?  | License (default: GPL+) |
| `group`         | string?  | RPM group (default: Applications/Internet) |
| `requires`      | string[]?| Requires lines |
| `cwd`           | string?  | Working directory for globs (default: .) |
| `rpmRootDir`    | string?  | rpmbuild top dir (default: ~/rpmbuild) |
| `buildArch`     | string?  | e.g. noarch (default) |
| `specTemplate`  | string?  | Custom spec template |
| `verbose`       | boolean? | Log rpmbuild output |

Returned `BuildContext` includes `rpms?: { rpm: string | null; srpm: string | null }` with paths to the built RPM(s).

### `RpmBuilder` class

Same options as `build()`. Emits `message` events with phase and args. Use for multiple builds or progress logging.

## License

See [LICENSE](LICENSE).
