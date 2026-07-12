# Dev Backdoor — play the whole game by command

Tobias 2026-07-12: testing must PLAY the game, not idle through it. This is
the harness: every function of play, driven through the REAL action paths
(the same session.action/pubBuy/... calls the UI makes), plus staging cheats.

**Enable:** `DEV_BACKDOOR=1` in the (gitignored) `.env`. Never set in the
prod compose — without it the route 404s.

**Call:** `POST /api/dev/cmd {"who":"claude","cmd":"..."}` → `{ok, said, state}`
where `said` = the new log lines a player would have heard.

## Play (real paths)
    new <cls> [race] [with Comp1,Comp2]   fresh delve + character + start
    roll                                  roll initiative
    attack [name]      cast <key> [name]  use <item> [name]   equip <item>
    descend  pass  retreat  cantrip  setout
    loot send <item> <who> | loot party <item> | loot take <item>
    pub buy <service> [who] | pub sell <item>
    companion <Name> <question...>        LLM companion reply

## Inspect
    state   hero   kit (keys + levels, works off-turn)   log [n]

## Staging cheats (explicit; dev-only)
    set hp <n> [name]   give <itemKey> [qty]   gold <n>
    kill [name]         spawn <monKey>

Example full sweep (what a playtest should look like):
    new cleric human with Gaspar → roll → cast bless → attack →
    give potion_clw → loot party potion_clw → loot take potion_clw →
    use potion_clw → equip … → descend → roll → retreat →
    pub sell gem_… → pub buy raisedead <name> → setout

## Multi-seat parties + the /dev QA cockpit (2026-07-12)
Testing multiplayer (e.g. the action queue) needs several humans in ONE party:
    create <cls> [race]          who hosts a delve, stays in lobby
    join <hostWho> <cls> [race]  who joins hostWho's party as a 2nd+ human
    addai <Name>                 host adds an AI companion
    start                        host starts the run
    roster                       every dev seat: delve, phase, whose turn, ⏳queue
Then drive each seat by its `who`. Off-turn attack/cast/use/pass QUEUE (⏳),
firing when that seat's turn arrives (poker action queue).

THE COCKPIT: open http://<host>/dev (DEV_BACKDOOR=1 only). A live dashboard —
all dev delves, combatants with HP bars / condition + ⏳ chips, the log, a
command console, and quick-action buttons. Claude drives via /api/dev/cmd;
a sighted human can watch/click the same board. /api/dev/inspect returns the
full live state as JSON.
