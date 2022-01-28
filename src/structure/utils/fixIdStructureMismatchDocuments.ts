import chunk from 'just-split'
import {ReferenceBehavior} from '../../constants'
import {DocumentDiff, Ti18nDocument} from '../../types'
import {
  buildDocId,
  createSanityReference,
  getBaseIdFromId,
  getConfig,
  getLanguageFromId,
} from '../../utils'

export const fixIdStructureMismatchDocuments = async (
  schema: string,
  documents: Ti18nDocument[]
): Promise<DocumentDiff[][]> => {
  const config = getConfig()
  const refsFieldName = config.fieldNames.references

  // remove old refs
  const removeOldRefsDiffs: DocumentDiff[] = []
  const existingBaseDocumentIds = new Set(documents.map((d) => getBaseIdFromId(d._id)))
  existingBaseDocumentIds.forEach((id) => {
    removeOldRefsDiffs.push({
      id,
      op: 'modify',
      type: schema,
      patches: [
        {
          op: 'remove',
          path: refsFieldName,
        },
      ],
    })
  })

  // create new document ids
  const baseTranslationsMap = new Map<string, [string, string][]>()
  const createNewDocumentDiffs = documents
    .filter((d) => d._id !== getBaseIdFromId(d._id))
    .reduce<DocumentDiff[]>((diffs, doc) => {
      const baseId = getBaseIdFromId(doc._id)
      const lang = getLanguageFromId(doc._id)
      if (lang) {
        const newId = buildDocId(baseId, lang)
        diffs.push({
          op: 'add',
          id: newId,
          type: doc._type,
          value: {...doc, _id: newId, _type: doc._type, [refsFieldName]: null},
        })
        diffs.push({op: 'remove', id: doc._id, type: doc._type})

        // patch base document with updated refs
        if (config.referenceBehavior !== ReferenceBehavior.DISABLED) {
          const map = baseTranslationsMap.get(baseId) ?? []
          map.push([lang, newId])
          baseTranslationsMap.set(baseId, map)
        }
      }
      return diffs
    }, [])
  baseTranslationsMap.forEach((value, baseId) => {
    createNewDocumentDiffs.push({
      op: 'modify',
      id: baseId,
      type: schema,
      patches: [
        {
          op: 'replace',
          path: refsFieldName,
          value: value.map(([lang, id]) => ({
            _key: lang,
            ...createSanityReference(id, config.referenceBehavior === ReferenceBehavior.WEAK),
          })),
        },
      ],
    })
  })

  return [...chunk(removeOldRefsDiffs, 100), ...chunk(createNewDocumentDiffs, 100)]
}
