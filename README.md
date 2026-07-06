# base-project

## Prerequisites

Install [pnpm](https://pnpm.io/):

```bash
npm install -g pnpm
```

## Setup

```bash
pnpm install
```

## Development

Build all packages:

```bash
pnpm build
```

Run all packages in watch mode:

```bash
pnpm dev
```

Clean build artifacts:

```bash
pnpm clean
```

Format code:

```bash
pnpm format
```

Lint code:

```bash
pnpm lint
```

## Package Management

Check for version mismatches:

```bash
pnpm syncpack:check
```

Fix version mismatches:

```bash
pnpm syncpack:fix
```

### Running Specific Applications

**Demo**

Run the standalone demo:

```bash
pnpm --filter @base-project/demo demo:dev
```
