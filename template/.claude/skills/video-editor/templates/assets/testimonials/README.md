# Testimonials

Each testimonial is a single JSON file in this folder. The quote-card and short-ad
briefs read them by id (the filename without `.json`).

## Format

```json
{
  "name": "Jordan Lee",
  "role": "Content Lead, Northwind Media",
  "quote": "Cut my edit time from 4 hours to 20 minutes.",
  "metric": "12x faster turnaround",
  "avatar": "/assets/testimonials/jordan-lee.jpg"
}
```

| Field    | Required | Notes                                                                 |
| -------- | -------- | --------------------------------------------------------------------- |
| `name`   | yes      | Person's display name.                                                |
| `role`   | yes      | Role and/or brand, e.g. "Founder, Acme Studio".                       |
| `quote`  | yes      | The testimonial line. Keep it punchy — one or two sentences.          |
| `metric` | no       | A headline result for a stat overlay, e.g. "12x faster turnaround".   |
| `avatar` | no       | Path under `public/` to a portrait image, used by `<QuoteCard avatar>`. |

## Using one in a composition

```tsx
import { QuoteCard } from '../../components';
import { staticFile } from 'remotion';
import testimonial from '../../../public/assets/testimonials/jordan-lee.json';

<QuoteCard
  quote={testimonial.quote}
  author={testimonial.name}
  role={testimonial.role}
  avatar={testimonial.avatar ? staticFile(testimonial.avatar) : undefined}
/>
```

## Add your own

Drop a new `<id>.json` file here (e.g. `casey-rivera.json`) following the format above,
plus the matching avatar image under `public/assets/testimonials/`.

`jordan-lee.json` is a fictional example shipped for reference. Testimonials are
user-supplied: your real customer quotes live in YOUR project and are never shipped
with the package.
