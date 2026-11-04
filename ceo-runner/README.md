# CEO runner

Panel → **CEO Agent** (`/ceo`, fakt super admin) madhun dilele commands ya Mac var chalnara worker.
Claude Code (`claude -p`) tumchya Claude login ne kaam karto — vegli API key nako.

```
Panel / phone ──ceoCommand──▶ core ceoTasks ◀──listen── runner (ha Mac)
                                                         │ project olkha (context)
                                                         │ ~/.ceo-runner/worktrees/<project>/<task>  (branch ceo/<task>)
                                                         │ claude -p → checks → commit
                                                         │ preview: Hosting channel link / APK link
"Deploy"  ──▶ <remote>/<branch> pull + merge → checks → push → backend deploy (badallelya files nusar)
"Web live" / "APK" ──▶ production branch varun hosting deploy / release APK
```

Tumcha mool checkout (ani tyatle uncommitted badal) kadhihi badlat nahi — sagla kaam vegalya worktree madhe.
Force push kadhich nahi; merge conflict asel tar agent sodvto, nahi sutla tar thambto.

## Suru kara

```bash
cd ceo-runner
npm install
npm start
```

Lagta: Node 23.6+, `claude` login, `firebase login` (core + projects che deploy access),
git push access (SSH), Flutter + Android SDK (mobile projects sathi).
Panel var "Runner online" disla ki tayar. Mac sleep la gela tar commands thambtat — runner punha suru zala ki uchalto.

Ekda: core deploy (`./deploy.sh core`) — `ceoCommand`, `ceoAction`, push trigger ani rules.

## Project kasa olkhto (context)

1. Panel madhe project nivadla tar toch.
2. "Auto" — command madhe ekach project che naav / `keywords` asel tar to.
3. Nahitar Claude (haiku) la sagle projects che `context`, README chi survat ani alikadche commands deun vicharto.
   Khatri 70% peksha kami → panel var "konta project?" vicharto (andaz nahi).

Agent la nehmi tya project cha `context`, ya project var alikade kelele CEO commands ani niyam milto;
repo madhla `CLAUDE.md` Claude Code swatah vachto. "Ajun badal" dila ki tech Claude session `--resume` hoto —
adhicha sagla sambhashan athvto.

Test (kaam nahi, fakt olkh): `npm run route -- "garage app madhe job card la search de"`

## Navin project

`projects.json` madhe entry:

| Field | Kay |
|---|---|
| `repo` | multisarv root pasun path (git repo havi) |
| `remotes`, `branch` | approve nantar ya branch var merge + sagalya remotes var push |
| `type`, `context`, `keywords` | project olkhayla — `context` jitka spasht titka barobar |
| `link` / `copy` | node_modules symlink / git baherchi files (.env.local, keystore) worktree madhe |
| `setup`, `checks` | worktree banlyavar / pratyek badlanantar (fail → deploy nahi) |
| `web.firebaseProject` | preview channel + Web live |
| `mobile.dir` | Flutter app folder — preview APK + production APK |
| `deploy[]` | `{ when, run }` — badallelya file `when` ne survat hotat tarach `run` |

`npm start` punha kela ki panel cha dropdown taja hoto.

## Model / auth badlaycha

Vegla Claude account: `ceo-runner/.env` madhe `CLAUDE_CONFIG_DIR=/Users/<you>/.claude-account-b`
(git madhe jat nahi). Ekda login: `CLAUDE_CONFIG_DIR=~/.claude-account-b claude` → `/login`.
Runner suru hotana konta account te dakhavto; login nasel tar suruch hot nahi.

```bash
CEO_MODEL=opus npm start                      # agent model
CEO_ROUTER_MODEL=haiku                        # project olkhayla (default)
ANTHROPIC_API_KEY=… npm start                 # login aivaji API key
CLAUDE_CODE_USE_VERTEX=1 … npm start          # Google Vertex AI
GOOGLE_APPLICATION_CREDENTIALS=key.json       # firebase login aivaji service account (server var)
```
