# The user's questions, and the briefing

## The open questions

After the research and before planning the build, ask the user only the decisions that change
how it's built, and that you can't sensibly decide from the research, their request and Scram's
limits. Good questions:
- how sign-up and sign-in should work, and which kinds of users (roles) there are;
- who may see or change what (private, shared with a team, public);
- what to do with a feature Scram can't do the same way (a Refresh button instead of live
  updates? leave the map out, or show addresses as text?);
- which of two reasonable ways to organise the data;
- how uploads work, and their limits;
- payments, other services, or AI features: in or out, and with which provider;
- anything you couldn't see that matters (behind a login, a button you didn't press);
- naming.

Don't ask about trivia, about anything already decided, or about the look: the theme questions
cover that (below). Prefer fewer, sharper questions: usually 3 to 7, at most 10, none at all if
nothing is genuinely open. Put every uncertainty you noted during the research first (merging
similar ones), unless the research has settled it since.

Each question: one line, why it matters (one line: what it changes in the build), and 2 to 4
short options with one marked as recommended. For example:

> **How should new people get in?** (Changes the sign-in pages and who can see what.)
> 1. Anyone can sign up with email and password (recommended)
> 2. Only people you invite
> 3. Sign in with Google (needs you to set up Google sign-in: Scram Desktop's guide shows how)

If the user says "you decide", go with your recommendations and list them in the briefing.

## The look: the theme questions

The research gives the layout and how things work; the **look** is the user's to choose. With
Scram Desktop connected, read `scram_guide` topic "themes" and ask its three questions. Otherwise
ask:
1. **What vibe should the app have?** 8 vibes that could suit this app, each with a few plain words
   (for example "Cozy: warm colours, soft corners, friendly type", "Modern: clean, crisp, lots of
   space"), your recommendation marked. You may offer "Stay close to {product}'s feel": a similar
   layout, density and style, never its logo, brand colours or fonts.
2. **How bold should the design be?** Subtle, Balanced (recommended) or Bold.
3. **Any must-haves or no-gos for the look?** No preference (recommended), light background, dark
   background, or their own brand colours and fonts.

## The briefing (for the user)

A plain-English document that tells the user what you found and what will be built, so they can
check you understood before anything is built. It's only for them; the build uses the spec or the
blueprint. Write it for someone who isn't technical: short paragraphs, bullet lists, "you" for
the reader, "I" for yourself, no marketing tone, and specific to this product, never generic.
Don't invent features the research doesn't show: anything unclear goes under "to double-check".

```markdown
# Research briefing: {what we're building}

## In a nutshell
3 to 5 sentences: what the product (or category) is, what our app will be, and the main choices.

## What I researched
Which products, screens and pages I looked at (with their addresses), how (a browser, their help
pages, reviews…), and what I deliberately didn't touch (sign-ups, buttons that change or delete
things, areas out of scope).

## What I understood the product to be
Who it's for, the main things people do with it, and the main things it keeps track of (tasks,
bookings, customers…) and how they relate.

## What we'll build
One short section per core feature: what it lets people do, the screens, the information behind
it, and in a sentence or two how it will work in Scram (pages, tables, sign-in).

## What we're leaving out, and why
Each feature left out, with its reason.

## Your answers
Each question, the answer that will be used, and what it changes. (Or: "No questions were needed.")

## Where Scram's limits change things
Features that will work a little differently because Scram can't do them yet (for example a
Refresh button instead of live updates), and the simpler version. Or "none".

## To double-check
What I guessed or couldn't see, so you can correct me.

## What happens next
The build plan: Scram's AI builds it in small steps (setup first), each one tested in Run mode
before the next; you can follow along in Scram Desktop and stop or change direction at any time.
```

Show the user the briefing, and wait for their go-ahead (or corrections) before building.
