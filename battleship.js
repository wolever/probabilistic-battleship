function mkArray(size, dflt) {
  return (new Array(size)).fill(null).map(x => typeof dflt == 'function' ? dflt() : dflt)
}

function boardEmpty(sz, dflt) {
  sz = sz || 10
  dflt = dflt === undefined? { type: 'empty' } : dflt
  return mkArray(sz, () => mkArray(sz, dflt))
}

function boardSliceIsEmpty(board, start, end) {
  for (let y = start[1]; y < end[1]; y += 1) {
    for (let x = start[0]; x < end[0]; x += 1) {
      if (board[y] === undefined)
        return false
      const val = board[y][x]
      const isEmpty = (
        val !== undefined &&
        val.type == 'empty'
      )
      if (!isEmpty)
        return false
    }
  }

  return true
}

function boardPlace(board, start, end, value) {
  const res = board.map((row, idx) => {
    const needsCopy = idx >= start[1] && idx <= end[1]
    return needsCopy ? row.concat() : row
  })

  for (let y = start[1]; y < end[1]; y += 1) {
    const row = res[y]
    for (let x = start[0]; x < end[0]; x += 1) {
      res[y][x] = value
    }
  }

  return res
}

const SHIPS = [
  {
    "type": "ship",
    "size": 2,
    "num": 1,
  },
  {
    "type": "ship",
    "size": 3,
    "num": 2,
  },
  {
    "type": "ship",
    "size": 4,
    "num": 3,
  },
  {
    "type": "ship",
    "size": 5,
    "num": 4,
  },
]

function generateBoards(board, ships, filter, res) {
  if (res === undefined)
    res = []

  if (!ships.length) {
    if (filter && !filter(board))
      return res
    res.push(board)
    return res
  }

  const ship = ships[0]
  const shipsRest = ships.slice(1)
  for (let y = 0; y < board.length; y += 1) {
    const row = board[y]
    for (let x = 0; x < row.length; x += 1) {
      const start = [x, y]
      const endHoriz = [x + ship.size, y + 1]
      if (boardSliceIsEmpty(board, start, endHoriz)) {
        const placed = boardPlace(board, start, endHoriz, ship)
        const subboards = generateBoards(placed, shipsRest, filter, res)
      }
      const endVert = [x + 1, y + ship.size]
      if (boardSliceIsEmpty(board, start, endVert)) {
        const placed = boardPlace(board, start, endVert, ship)
        const subboards = generateBoards(placed, shipsRest, filter, res)
      }
    }
  }

  return res
}

function boardScan(board, callback) {
  for (let y = 0; y < board.length; y += 1) {
    const row = board[y]
    for (let x = 0; x < row.length; x += 1) {
      const res = callback(x, y, row[x])
      if (res !== undefined)
        return res
    }
  }
}

function boardShoot(board, pos) {
  const [x, y] = pos
  const val = board[y][x]
  const newVal = (
    val.type == 'empty' ? { type: 'miss', isKnown: true } :
    val.type == 'ship' ? { ...val, isHit: true, isKnown: true } :
    null
  )
  if (!newVal)
    throw new Error("Huh?")

  const res = boardPlace(board, [x, y], [x + 1, y + 1], newVal)
  if (newVal.type == 'ship') {
    // check for sink
    let shipParts = []
    boardScan(res, (x, y, val) => {
      if (val.type == 'ship' && val.num == newVal.num) {
        if (!val.isHit) {
          shipParts = []
          return false
        }
        shipParts.push([x, y, val])
        if (shipParts.length == val.size) {
          return false
        }
      }
    })
    shipParts.forEach(([x, y, ship]) => {
      res[y][x] = {...ship, isSunk: true}
    })
  }

  return res
}

function playHuntAndTarget(board) {
  // 1. See if there are any hits that have not been sunk
  const firstHits = []
  boardScan(board, (x, y, val) => {
    if (val.type == 'ship' && val.isHit && !val.isSunk)
      firstHits.push([x, y, val])
  })
  while (firstHits.length > 0) {
    const [x, y, val] = firstHits.pop()
    const targets = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]
    for (const [x, y] of targets) {
      const val = board[y] && board[y][x]
      const doNotShoot = (
        val === undefined ||
        val.isKnown
      )
      if (doNotShoot)
        continue
      return boardShoot(board, [x, y])
    }
  }

  // 2. Pick the first odd non-hit spot
  const spot = boardScan(board, (x, y, val) => {
    if (x % 2 + y % 2 != 1)
      return
    if (val.type == 'empty' || val.type == 'ship' && !val.isHit)
      return [x, y]
  })
  if (spot) {
    const [x, y] = spot
    return boardShoot(board, [x, y])
  }

  return null
}

function playProbabilistic(board, ships) {
  const heatmap = boardEmpty(board.length, 0)
  const boardBitmask = boardEmpty(board.length, 0)
  const sunkShips = {}
  const hits = []
  boardScan(board, (x, y, val) => {
    if (val.isSunk)
      sunkShips[val.num] = true
    if (val.isHit && !val.isSunk)
      hits.push([x, y])
    boardBitmask[y][x] = (
      val.isSunk || val.type == 'miss' ?
        { type: 'not-empty' } :
        { type: 'empty' }
    )
  })

  let maxCount = 0
  const allPositions = generateBoards(
    boardBitmask,
    ships.filter(s => !sunkShips[s.num]),
    filterBoard => {
      let coversAllHits = hits.filter(([x, y]) => {
        return filterBoard[y][x].type == 'ship'
      })
      return coversAllHits.length == hits.length
    },
  )
  allPositions.forEach(b => {
    boardScan(b, (x, y, val) => {
      if (val.type == 'ship' && !board[y][x].isHit) {
        heatmap[y][x] += 1
        const val = heatmap[y][x]
        if (val > maxCount)
          maxCount = val
      }
    })
  })

  if (maxCount == 0) {
    return null
  }

  let maxLoc = null
  boardScan(heatmap, (x, y, val) => {
    heatmap[y][x] = val / maxCount
    if (val == maxCount)
      maxLoc = [x, y]
  })

  return [boardShoot(board, maxLoc), heatmap]
}

function boardRender(board) {
  if (!board)
    return "(no board)"

  const res = [`<table class="board">`]
  board.forEach(row => {
    res.push(`<tr>`)
    res.push(...row.map(space => {
      const classes = [
        space.type,
        space.isHit && 'hit',
        space.isSunk && 'sunk',
      ]

      return `<td class="${classes.join(' ')}">${space.size || ''}</td>`
    }))
    res.push(`</tr>`)
  })
  res.push(...'</table>')
  return res.join('')
}

function heatmapRender(board) {
  if (!board)
    return "(no board)"

  const res = [`<table class="heatmap">`]
  board.forEach(row => {
    res.push(`<tr>`)
    res.push(...row.map(space => {
      return `<td style="background-color: red; opacity: ${space}"></td>`
    }))
    res.push(`</tr>`)
  })
  res.push(...'</table>\n')
  return res.join('')
}

(() => {
  const ships = SHIPS.slice(0, 4)
  const boards = generateBoards(boardEmpty(7), ships)
  let b = boards[parseInt(Math.random() * boards.length)]
  let heatmap
  let count = 0
  while (b) {
    document.write(boardRender(b))
    const x = playProbabilistic(b, ships)
    if (!x)
      break
    b = x[0]
    heatmap = x[1]
    document.write(heatmapRender(heatmap))
    document.write("<br />")
    if (count++ > 100)
      break
  }

})()
