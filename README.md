# Trivia Ops

## Development
- Install deps: `npm install`
- Run dev server: `npm run dev`

## Database Migrations (D1)
- Apply locally: `npx wrangler d1 migrations apply trivia_ops --local`
- Apply to Cloudflare (remote): `npx wrangler d1 migrations apply trivia_ops --remote`

## AI Tool Prompts (Examples)

### Bulk import
```
Q: Which planet is known as the Red Planet?
A: Mars

Q: Who painted the Mona Lisa?
A: Leonardo da Vinci
```

### Single answer
```
Single-answer trivia about volcanoes. count: 10
```

### Multiple choice
```
Easy general knowledge questions about 90s music. count: 10
```

### Music bulk upload (parse instructions)
Standard:
```
Titles look like "Ordinal - Artist - Song". Use two answers:
Use ordinal for question number.
Answer 1 = Song, Answer 2 = Artist. Leave factoid empty.
```

Mashup:
```
Filenames look like "{ordinal} - {artist_1} & {artist_2} - {song}". Use two answers:
Answer 1 = artist_1, Answer 2 = artist_2. Put the song title in the factoid.
Flag anything ambiguous for review.
```

Covers:
```
Titles look like "Ordinal - Song - Cover Artist - Original Artist". Use Ordinal as question number, Song as answer 1, Cover Artist as answer 2,
Original Artist as answer 3
```
