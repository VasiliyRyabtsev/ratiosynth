// A model of the piece, learned from the piece.
//
// It is a variable-order Markov model over whatever symbols it is fed: lattice
// moves, note lengths, articulations. It has never heard any other music. At
// the start it knows nothing and falls back entirely on the lattice prior; by
// the end of a few minutes it has opinions, and those opinions are the piece's
// own material.
//
// The blend between orders is PPM escape method C, which is the standard choice
// with *no* free parameter in it: the weight given to a context is decided by
// how many different things have followed it, not by a constant someone picked.
//
//     P(x | context) = ( n(x) + u * P(x | shorter context) ) / ( N + u )
//
// where n(x) is how often x followed this context, N the total, u how many
// distinct symbols followed it. A context seen once with one continuation gives
// that continuation weight 1/2 and hands the other half back; a context seen
// fifty times with one continuation gives it 50/51. Nobody tunes that.
//
// The recursion bottoms out in the lattice prior from prior.js, which is defined
// for every symbol including ones never seen, so there is no zero-frequency
// problem and no smoothing constant anywhere.

const SEPARATOR = "";

export class Predictor {
  /**
   * `maxOrder` is a memory bound, not a musical control. Contexts longer than
   * anything that has actually recurred contribute nothing: they have no counts,
   * so the blend passes straight through them.
   */
  constructor({ maxOrder = 6 } = {}) {
    this.maxOrder = maxOrder;
    this.tables = new Map(); // context string -> { total, counts: Map }
    this.history = [];
  }

  /** The chain of context nodes for the current history, shortest first. */
  nodes() {
    const chain = [];
    for (let order = 0; order <= this.maxOrder; order++) {
      if (order > this.history.length) break;
      const context = order === 0 ? "" : this.history.slice(-order).join(SEPARATOR);
      const node = this.tables.get(context);
      if (node && node.total > 0) chain.push(node);
    }
    return chain;
  }

  /**
   * Probability of each candidate symbol, given the history.
   *
   * `base` maps a symbol to its prior probability. Returns a Map so the caller
   * can turn it into bits without recomputing anything.
   */
  distribution(symbols, base) {
    const chain = this.nodes();
    const out = new Map();

    for (const symbol of symbols) {
      let p = base(symbol);
      // Shortest context first, so each longer one refines the last.
      for (const node of chain) {
        const distinct = node.counts.size;
        const seen = node.counts.get(symbol) ?? 0;
        p = (seen + distinct * p) / (node.total + distinct);
      }
      out.set(symbol, p);
    }

    return out;
  }

  /** Record what actually happened, at every order. */
  observe(symbol) {
    for (let order = 0; order <= this.maxOrder; order++) {
      if (order > this.history.length) break;
      const context = order === 0 ? "" : this.history.slice(-order).join(SEPARATOR);
      let node = this.tables.get(context);
      if (!node) {
        node = { total: 0, counts: new Map() };
        this.tables.set(context, node);
      }
      node.counts.set(symbol, (node.counts.get(symbol) ?? 0) + 1);
      node.total++;
    }
    this.history.push(symbol);
  }

  /**
   * How certain the model currently is, in bits, over a candidate set.
   *
   * This is the number that drives long-range form: when it falls the music has
   * settled into something it can predict, and holding surprisal at a target
   * then forces it to depart. See DESIGN.md.
   */
  static entropy(probabilities) {
    let total = 0;
    for (const p of probabilities.values()) total += p;
    if (total <= 0) return 0;
    let bits = 0;
    for (const p of probabilities.values()) {
      if (p <= 0) continue;
      const q = p / total;
      bits -= q * Math.log2(q);
    }
    return bits;
  }
}
