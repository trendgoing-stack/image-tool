/**
 * 加工リストと、元に戻す（Undo）／やり直す（Redo）の履歴。
 * 加工は非破壊で、リストとして記録しておき、保存時に元の画像へ順に適用する。
 * 各状態は変更しない配列として扱い、変更のたびに新しい配列を履歴に積む。
 */
const MAX_HISTORY = 100

let nextId = 1
export function newId() {
  return nextId++
}

export class EditHistory {
  constructor() {
    this.reset()
  }

  reset() {
    this.states = [[]]
    this.index = 0
    this.lastMergeKey = null
  }

  get ops() {
    return this.states[this.index]
  }

  get canUndo() {
    return this.index > 0
  }

  get canRedo() {
    return this.index < this.states.length - 1
  }

  /**
   * 新しい状態を記録する（やり直し用の履歴は捨てる）。
   * mergeKey が直前と同じなら、履歴を増やさずに直前の状態を置き換える
   * （文字の入力やスライダー操作で、1文字・1目盛りごとに Undo が必要にならないように）。
   */
  commit(ops, mergeKey = null) {
    if (mergeKey && mergeKey === this.lastMergeKey && this.index > 0 && this.index === this.states.length - 1) {
      this.states[this.index] = ops
      return
    }
    this.states = this.states.slice(0, this.index + 1)
    this.states.push(ops)
    if (this.states.length > MAX_HISTORY + 1) this.states.shift()
    this.index = this.states.length - 1
    this.lastMergeKey = mergeKey
  }

  add(op) {
    this.commit([...this.ops, op])
  }

  update(id, changes, mergeKey = null) {
    this.commit(
      this.ops.map((op) => (op.id === id ? { ...op, ...changes } : op)),
      mergeKey,
    )
  }

  remove(id) {
    this.commit(this.ops.filter((op) => op.id !== id))
  }

  /** 次の変更を、直前の変更とまとめないようにする */
  breakMerge() {
    this.lastMergeKey = null
  }

  undo() {
    this.breakMerge()
    if (this.canUndo) this.index--
  }

  redo() {
    this.breakMerge()
    if (this.canRedo) this.index++
  }
}
