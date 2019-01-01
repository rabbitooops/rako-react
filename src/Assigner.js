import Store from 'rako'
import React from 'react'
import {scheduleArrange} from './scheduler'
import {getStoreAgent} from './StoreAgent'
import {link} from './link'
import {sortByOrder, defaultMapper, getOrder, uniqueFlag} from './utils'

class Assigner {
  constructor(isEqual, values) {
    this.renderId = 0
    this.value = undefined
    this.instances = []
    this.candidates = []
    this.isEqual = isEqual
    this.isScheduled = false
    this.requireClean = false

    const objects = []
    const linkers = []
    values.forEach(value => {
      if (value instanceof Store) {
        linkers.push(link(value, defaultMapper))
      } else if (typeof value === 'function') {
        linkers.push(value)
      } else if (typeof value === 'object') {
        objects.push(value)
      } else {
        throw new TypeError('`assign`: Expected each value in `values` to be an object, a store or a `linker`.')
      }
    })

    const stores = new Array(linkers.length)
    linkers.forEach((linker, index) => {
      const flag = linker((flag, store, mapper) => {
        if (flag === uniqueFlag) {
          stores[index] = store
          objects.push(getStoreAgent(store).connect(this, mapper))
          return uniqueFlag
        }
      })
      if (flag !== uniqueFlag) {
        throw new TypeError('`assign`: Expected each value in `values` to be an object, a store or a `linker`.')
      }
    })
    if (stores.length !== new Set(stores).size) {
      throw new Error('`assign`: Don\'t pass duplicate `store` to `assign`.')
    }

    this.value = Object.freeze(Object.assign({}, ...objects))
  }
  calculate(subvalue) {
    const oldvalue = this.value
    this.value = Object.freeze(Object.assign({}, oldvalue, subvalue))
    const result = this.isEqual(this.value, oldvalue)
    if (typeof result !== 'boolean') {
      throw new TypeError('Expected returned value from `isEqual` to be a boolean.')
    }
    if (result) {
      return null
    }
    this.renderId += 1
    return this
  }
  arrange() {
    if (!this.isScheduled) {
      this.isScheduled = true
      scheduleArrange(() => {
        this.isScheduled = false

        if (this.requireClean) {
          if (this.candidates.length) {
            this.candidates = this.candidates.filter(candidate => !candidate.isUnmounted)
          }
          if (this.instances.length) {
            this.instances = this.instances.filter(instance => !instance.isUnmounted)
          }
          this.requireClean = false
        }
        if (this.candidates.length) {
          this.instances.push(...this.candidates.sort(sortByOrder))
          this.candidates.length = 0
        }
      })
    }
  }
  hoc(Component) {
    const context = this
    return class $Assigner extends React.Component {
      constructor(props) {
        super(props)
        this.isUnmounted = false
        this.renderId = undefined
        this.order = getOrder()
      }
      update() {
        if (!this.isUnmounted && this.renderId !== context.renderId) {
          this.forceUpdate()
        }
      }
      componentWillUnmount() {
        this.isUnmounted = true
        context.requireClean = true
        context.arrange()
      }
      componentDidMount() {
        context.candidates.push(this)
        context.arrange()
      }
      render() {
        this.renderId = context.renderId
        return React.createElement(Component, Object.assign({}, context.value, this.props))
      }
    }
  }
}

export default Assigner