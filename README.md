# ELYSILANA

A calm, always-live ledger for Solana.

[![Live site](https://img.shields.io/badge/live-elysilana.fun-blue?style=flat-square)](https://elysilana.fun)
![Chain](https://img.shields.io/badge/chain-Solana-blue?style=flat-square)

**Contract address:** `pending`

## Overview

ELYSILANA is a static site that follows the busiest Solana tokens in real time and holds a seat free at the top of its ledger for the ELYSILANA token. The contract address, the X account and the GitHub link each stay dark until the project verifies them.

## Features

- Live market ledger: the ten most active Solana tokens by 24h volume, with logo, price, change, volume and liquidity.
- Scrolling ticker driven by identical figures, refreshed every minute and paused while the tab is hidden.
- Row one reserved for the ELYSILANA token. Before the contract is announced it shows the brand placeholder; afterwards it loads its own live numbers.
- A register of external facts. Anything unverified renders inert, with no value and no link.
- Click-to-copy contract slot, pinned to the top of the screen.
- Respects `prefers-reduced-motion`.

## Links

- Site: https://elysilana.fun
- X: pending
- GitHub: pending
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Develop

```bash
npm run build   # writes the deployable site to dist/
npm run gates   # runs the verification gates
```

Edit `register.json` to verify a fact (contract, X, GitHub), then rebuild. Upload the contents of `dist/` to your static host.

## License

MIT. See [LICENSE](LICENSE).
