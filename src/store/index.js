import Vue from 'vue'
import Vuex from 'vuex'
import { getLayers, Group, Context, getLocalizedLabels, restoreVersion } from '../layersConfig'

Vue.use(Vuex)

const setContextsTimes = function(state) {
  const contextsTimes = []
  state.contexts.forEach(c => {
    const times = c.layers.filter(l => l.type === 'wms' && l.times.length)
                          .reduce((contextTimes, l) => contextTimes.concat(l.times), [])
                          // Remove duplicates
                          .filter((elem, pos, arr) => arr.findIndex(el => el.iso8601 === elem.iso8601) === pos)
                          .sort((t1, t2) => Date.parse(t1.iso8601) - Date.parse(t2.iso8601))
    c.times = times
    if (times && times.length) contextsTimes[c.id] = c.times[c.times.length - 1]
  })

  state.contextsTimes = contextsTimes
}

// root state object.
// each Vuex instance is just a single state tree.
const state = {
  layers: [],
  contexts: [],
  groups: null,
  layerInfo: null, // a modal with the file content is shown when not null
  contextsTimes: [],
  kmlOverlay: null,
  enableFeedback: false,
  activeContextsIds: [],

  editing: false,
  editGroup: null,
  editContext: null,
  editLayers: false
}

// mutations are operations that actually mutates the state.
// each mutation handler gets the entire state tree as the
// first argument, followed by additional payload arguments.
// mutations must be synchronous and can be recorded by plugins
// for debugging purposes.
const mutations = {
  enable_edit(state, { editing }) {
    state.editing = editing
  },
  add_group(state) {
    const newGroup = new Group({
      labels: getLocalizedLabels(null, 'New group')
    }, [], state.groups)
    state.groups.items.push(newGroup)
  },
  add_context(state) {
    const newContext = new Context({
      labels: getLocalizedLabels(null, 'New context')
    })
    newContext.parent = state.groups
    newContext.times = []
    state.groups.items.push(newContext)
    state.contexts.push(newContext)
  },
  edit_item(state, { id }) {
    const item = state.groups.findById(id)
    if (item) {
      if (item.isGroup) state.editGroup = item
      else state.editContext = item
    } else {
      state.editContext = state.editGroup = null
    }
  },
  delete_item(state, { id }) {
    const item = state.groups.findById(id)
    const index = item.parent.items.findIndex(i => i.id === id)
    if (index > -1) item.parent.items.splice(index, 1)

    // No need to delete contexts and layers here. They will be deleted on save
  },
  edit_layers(state, { edit }) {
    state.editLayers = edit
  },
  save_group(state, { id, label, labels, exclusive, infoFile }) {
    const group = state.groups.findById(id)
    group.label = label
    group.labels = labels
    group.exclusive = exclusive
    group.infoFile = infoFile
  },
  save_context(state, { id, label, labels, infoFile, active, inlineLegendUrl, layerIds }) {
    const context = state.groups.findById(id)
    context.label = label
    context.labels = labels
    context.infoFile = infoFile
    context.active = active
    context.inlineLegendUrl = inlineLegendUrl
    context.layers = layerIds.map(id => state.layers.find(layer => layer.id === id))

    setContextsTimes(state)
  },
  receive_layers(state, { layersConf }) {
    state.layers = layersConf.layers
    state.contexts = layersConf.contexts
    state.groups = layersConf.groups

    setContextsTimes(state)

    state.activeContextsIds = state.contexts.reduce((a, c) => c.active ? a.concat(c.id) : a, [])
  },
  toggle_context(state, { contextId }) {
    const context = state.contexts.find(c => c.id === contextId)
    if (context) {
      const idx = state.activeContextsIds.indexOf(contextId)
      if (idx === -1) state.activeContextsIds.push(contextId)
      else state.activeContextsIds.splice(idx, 1)
    }
  },
  show_layer_info(state, { fileName, label }) {
    state.layerInfo = { fileName: fileName, label: label }
  },
  set_context_time(state, { contextId, time }) {
    state.contextsTimes.splice(contextId, 1, time)
  },
  overlay_kml(state, { kml }) {
    state.kmlOverlay = kml
  },
  enable_feedback(state, { enable }) {
    state.enableFeedback = enable
  },
  update_group(state, { groupId, value }) {
    // Called when dragging an item from one group to another, for both old and new group
    const group = state.groups.findById(groupId)
    if (group) group.items = value

    // Update all items' partents
    group.items.forEach(item => { item.parent = group })
  },
  update_layers(state, { value }) {
    state.layers = value

    // swap the old contexts' layers with the new ones
    state.contexts.forEach(context => {
      const contextLayers = context.layers
      context.layers = contextLayers.map(layer => value.find(l => l.id === layer.id)).filter(l => !!l)
    })

    setContextsTimes(state)
  }
}

// actions are functions that causes side effects and can involve
// asynchronous operations.
const actions = {
  fetchLayersConfig({ commit }) {
    getLayers(Vue.i18n.locale())
      .then(layersConf => commit('receive_layers', { layersConf }))
      .catch(error => alert(error))
  },
  restoreBackup({ dispatch, commit }, { version }) {
    restoreVersion(version)
      .then((x) => dispatch('fetchLayersConfig'))
      .catch(error => alert('Server error:\n' + error.statusText))
  }
}

// getters are functions
const getters = {
  activeLayers: state => {
    const activeLayers = []
    state.contexts.filter(context => state.activeContextsIds.indexOf(context.id) !== -1)
                  .forEach(context => context.layers.forEach(layer => activeLayers.push(layer)))
    // Delete duplicates, in case a layer belongs to many contexts
    return activeLayers.filter((elem, pos, arr) => arr.indexOf(elem) === pos)
  },
  queryableLayers: (state, getters) => getters.activeLayers.filter(layer => layer.statistics)
}

// A Vuex instance is created by combining the state, mutations, actions,
// and getters.
export default new Vuex.Store({
  strict: process.env.NODE_ENV !== 'production',
  state,
  getters,
  actions,
  mutations
})
