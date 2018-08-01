# Overview
This is an implementation of the snowball consensus algorithm. The whitepaper is available in the docs directory.

## Protocols
Snowball is an augmented version of snowflake. Snowflake is an augmented version of Slush.

### Slush
In Slush, a node starts out initially in an uncolored
state. Upon receiving a transaction from a client, an
uncolored node updates its own color to the one carried
in the transaction and initiates a query.To perform a
query, a node picks a small, constant sized (k) sample
of the network uniformly at random, and sends a query
message. Upon receiving a query, an uncolored node
adopts the color in the query, responds with that color,
and initiates its own query, whereas a colored node simply
responds with its current color. If k responses are not
received within a time bound, the node picks an additional
sample from the remaining nodes uniformly at random
and queries them until it collects all responses. Once the
querying node collects k responses, it checks if a fraction
≥ αk are for the same color, where α > 0.5 is a protocol
parameter. If the αk threshold is met and the sampled
color differs from the node’s own color, the node flips
to that color. It then goes back to the query step, and
initiates a subsequent round of query, for a total of m
rounds. Finally, the node decides the color it ended up
with at time m.
```
1:  procedure onQuery(v, col')
2:    if col = ⊥ then col := col'
3:    respond(v, col)
4:  procedure slushLoop(u, col0 ∈ {R, B, ⊥})
5:    col := col0 // initialize with a color
6:    for r ∈ {1 . . . m} do
7:      // if ⊥, skip until onQuery sets the color
8:      if col = ⊥ then continue
9:      // randomly sample from the known nodes
10:     K := sample(N \u, k)
11:     P := [query(v, col) for v ∈ K]
12:     for col' ∈ {R, B} do
13:       if P.count(col') ≥ α · k then
14:         col := col'
15:   accept(col)
```
### Snowflake
Snowflake augments Slush with a single counter that captures
the strength of a node’s conviction in its current
color. This per-node counter stores how many consecutive
samples of the network have all yielded the same
color. A node accepts the current color when its counter
exceeds β, another security parameter. Figure 2 shows
the amended protocol, which includes the following modifications:
1. Each node maintains a counter cnt;
2. Upon every color change, the node resets cnt to 0;
3. Upon every successful query that yields ≥ αk responses
for the same color as the node, the node increments
cnt.
```
1:  procedure snowflakeLoop(u, col0 ∈ {R, B, ⊥})
2:    col := col0, cnt := 0
3:    while undecided do
4:      if col = ⊥ then continue
5:      K := sample(N \u, k)
6:      P := [query(v, col) for v ∈ K]
7:      for col' ∈ {R, B} do
8:        if P.count(col') ≥ α · k then
9:          if col != col then
10:           col := col', cnt := 0
11:         else
12:           if ++cnt > β then accept(col)
```
### Snowball
Snowball augments Snowflake with confidence counters
that capture the number of queries that have yielded a
threshold result for their corresponding color (Figure 3).
A node decides a color if, during a certain number of
consecutive queries, its confidence for that color exceeds
that of other colors. The differences between Snowflake
and Snowball are as follows:
1. Upon every successful query, the node increments its
confidence counter for that color.
2. A node switches colors when the confidence in its
current color bec
```
1:  procedure snowballLoop(u, col0 ∈ {R, B, ⊥})
2:    col := col0, lastcol := col0, cnt := 0
3:    d[R] := 0, d[B] := 0
4:    while undecided do
5:      if col = ⊥ then continue
6:      K := sample(N \u, k)
7:      P := [query(v, col) for v ∈ K]
8:      for col' ∈ {R, B} do
9:        if P.count(col') ≥ α · k then
10:         d[col']++
11:         if d[col'] > d[col] then
12:           col := col'
13:           if col' != lastcol then
14:             lastcol := col', cnt := 0
15:           else
16:             if ++cnt > β then accept(col)
```
## Other References
[coindesk article](https://www.coindesk.com/emin-gun-sirer-unveils-simple-yet-powerful-consensus-protocol/)
[mashable article](https://mashable.com/2018/07/25/best-blockchain-race/#JwCJ1mzAKmqy)
[whitepaper](https://ipfs.io/ipfs/QmUy4jh5mGNZvLkjies1RWM4YuvJh5o2FYopNPVYwrRVGV)
