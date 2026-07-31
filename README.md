# 🌳 Family Tree

**Live:** <https://familytree.baluyut.com>

A private family-tree web app: add / edit / remove members (a name is required; an
optional portrait photo is uploaded by clicking the avatar), link spouses & partners,
parents and children, and handle real-world cases like **separation and remarriage** —
ex-partners are kept, and children stay attached to both parents.

## Stack

- **Frontend:** React + TypeScript + Vite
- **API + storage:** Netlify Functions + [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
- **Access:** a single shared password, exchanged for a secure (httpOnly, signed) session cookie

## Data model

| Entity | Fields |
| --- | --- |
| **Member** | `id`, `name` (required), `photoId?` |
| **Partnership** | two members + `status`: `married \| partner \| separated` |
| **Parentage** | `parent → child` |

A separation simply flips a partnership's `status`; parentages are never touched, so
children remain linked to both parents. (A family tree is a *graph*, not a tree.)
Trees saved under the older, richer schema (gender, dates, notes, parentage types,
more statuses) are upgraded transparently on load by `normalizeTree()`.

## Develop

```bash
npm install

npm run dev          # Vite UI only (no functions/storage)
npx netlify dev      # full stack: UI + functions + a local Blobs sandbox
```

The full stack runs at <http://localhost:8888> via `netlify dev`.

## Environment variables

Set these in the Netlify dashboard (Site settings → Environment variables), and in a
local `.env` file for `netlify dev`:

| Variable | Purpose |
| --- | --- |
| `FAMILYTREE_PASSWORD` | the shared access password |
| `FAMILYTREE_SECRET` | a long random string used to sign the session cookie |

See `.env.example`.

## Deploy

Connect this repo to Netlify. It builds with `npm run build`, publishes `dist/`, and
serves the functions from `netlify/functions/`. Set the two environment variables above
before the first deploy.
