/*
Slush
======

node starts out initially in an uncolored state.
on transaction an uncolored node updates its color to the transaction color and initiates a query.
To perform a query, a node picks a small, constant sized (k) sample of the network
uniformly at random, and sends a query message. Upon receiving a query,
an uncolored node adopts the color in the query, responds with that color,
and initiates its own query, whereas a colored node simply responds with its current color.
If k responses are not received within a time bound, the node picks an additional
sample from the remaining nodes uniformly at random and queries them until it collects
all responses. Once the querying node collects k responses, it checks if a
fraction ≥ αk are for the same color, where α > 0.5 is a protocol parameter.
If the αk threshold is met and the sampled color differs from the node’s own color,
the node flips to that color. It then goes back to the query step, and initiates a
subsequent round of query, for a total of m rounds. Finally, the node decides
the color it ended up with at time m.


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
*/

let sampleSize = 5 // referred to as 'k' in whitepaper
let txs = {} // {id: <number>, color: <R or B>}

function onQuery (tx) {
  if (!txs[tx.id]) txs[tx.id] = tx
  return txs[tx.id].color
}

function onTx (tx) {
  if (!txs[tx.id]) txs[tx.id] = tx

}
