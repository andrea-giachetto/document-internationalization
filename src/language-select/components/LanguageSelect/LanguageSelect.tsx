import React from 'react'
import get from 'just-safe-get'
import {Button, Menu, MenuButton, PopoverProps} from '@sanity/ui'
import type {SchemaType} from '@sanity/types'
import type {SanityDocument} from '@sanity/client'
import {ChevronDownIcon} from '@sanity/icons'
import {SingleFlag} from '../SingleFlag'
import {
  buildDocId,
  getBaseIdFromId,
  getBaseLanguage,
  getConfig,
  getLanguageFromId,
} from '../../../utils'
import {useLanguages} from '../../hooks'
import {UiMessages} from '../../../constants'
import {IExtendedLanguageObject} from '../../../types'
import useListeningQuery from '../../hooks/useListeningQuery'
import {LanguageSelectList} from './LanguageSelectList'
import {LanguageSelectContext} from './LanguageSelectContext'

type Props = {
  schemaType: SchemaType
  document: SanityDocument
}

const POPOVER_PROPS: PopoverProps = {
  constrainSize: true,
  placement: 'bottom',
  portal: true,
}

export const LanguageSelect: React.FC<Props> = ({schemaType, document}) => {
  const config = React.useMemo(() => getConfig(schemaType.name), [schemaType.name])
  const [pending, languages] = useLanguages(document)

  const baseLanguage = React.useMemo(
    () => getBaseLanguage(languages, config.base),
    [languages, config.base]
  )
  const currentLanguageCode = React.useMemo(
    () => getLanguageFromId(document._id) || (baseLanguage ? baseLanguage.id : null),
    [document._id, baseLanguage]
  )
  const currentLanguageObject = React.useMemo(
    () => languages.find((lang) => lang.id === currentLanguageCode),
    [languages, currentLanguageCode]
  )
  const currentLanguageFlagCode = React.useMemo(
    () => currentLanguageCode?.split(/[-_]/).pop(),
    [currentLanguageCode]
  )

  // Find and listen to changes on all potential language versions of documents
  const query = `*[_type == $type && _id in $ids]{
    _id, 
    "${config.fieldNames.lang}": ${config.fieldNames.lang}
  }`
  const queryParams = React.useMemo(() => {
    const baseId = getBaseIdFromId(document._id)
    const publishedIds = languages.map((lang) =>
      lang === baseLanguage ? baseId : buildDocId(baseId, lang.id)
    )
    const draftIds = publishedIds.map((id) => `drafts.${id}`)

    return {
      ids: [...publishedIds, ...draftIds],
      type: document._type,
    }
  }, [baseLanguage, languages, document._id, document._type])

  const {loading, data} = useListeningQuery(query, queryParams)

  // Create a list of objects with current status
  const languagesObjects = React.useMemo(() => {
    const draftLanguageObjects: IExtendedLanguageObject[] = []
    const publishedLanguageObjects: IExtendedLanguageObject[] = []
    const missingLanguageObjects: IExtendedLanguageObject[] = []

    if (!data?.length) {
      return {
        draftLanguageObjects,
        publishedLanguageObjects,
        missingLanguageObjects,
      }
    }

    // Prefer drafts if they exist
    const filteredDocuments = data.reduce((acc, cur) => {
      if (!cur._id.startsWith(`drafts.`)) {
        const alsoHasDraft = data.some((doc) => doc._id === `drafts.${cur._id}`)

        return alsoHasDraft ? acc : [...acc, cur]
      }

      return [...acc, cur]
    }, [])

    const editStatePerLanguage = new Map()
    filteredDocuments.forEach((doc) => {
      const lang = get(doc ?? {}, config.fieldNames.lang) as string | undefined
      const isBase = doc && doc._id.replace(/^drafts\./, '') === getBaseIdFromId(doc._id)
      if (lang) {
        editStatePerLanguage.set(lang, doc)
      } else if (isBase && baseLanguage?.id) {
        editStatePerLanguage.set(baseLanguage.id, doc)
      }
    })

    languages.forEach((lang, index) => {
      const extendedObject = {
        ...lang,
        isBase: baseLanguage ? lang.id === baseLanguage.id : index === 0,
        isCurrentLanguage: lang.id === currentLanguageCode,
      }
      const doc = editStatePerLanguage.get(lang.id)
      if (doc?._id && !doc._id.startsWith(`drafts.`)) {
        publishedLanguageObjects.push(extendedObject)
      } else if (doc?._id && doc._id.startsWith(`drafts.`)) {
        draftLanguageObjects.push(extendedObject)
      } else {
        missingLanguageObjects.push(extendedObject)
      }
    })

    return {
      draftLanguageObjects,
      publishedLanguageObjects,
      missingLanguageObjects,
    }
  }, [config, languages, baseLanguage, data, currentLanguageCode])

  if (
    !currentLanguageObject ||
    !currentLanguageCode ||
    pending ||
    loading ||
    languages.length === 0
  ) {
    return (
      <Button
        disabled
        mode="bleed"
        padding={3}
        loading={pending || loading}
        iconRight={ChevronDownIcon}
        text={UiMessages.languageSelect.placeholder}
      />
    )
  }

  return (
    <LanguageSelectContext.Provider
      value={{
        baseLanguage,
        currentLanguage: currentLanguageObject,
        currentDocumentType: document._type,
        currentDocumentId: document._id,
      }}
    >
      <MenuButton
        id="document-internationalization/language-select"
        popover={POPOVER_PROPS}
        button={
          <Button
            mode="bleed"
            icon={<SingleFlag code={currentLanguageFlagCode} langCulture={currentLanguageCode} />}
            iconRight={ChevronDownIcon}
            padding={3}
            title={currentLanguageObject.title ?? currentLanguageObject.id}
            text={currentLanguageObject.title ?? currentLanguageObject.id}
          />
        }
        menu={
          <Menu>
            <LanguageSelectList {...languagesObjects} />
          </Menu>
        }
      />
    </LanguageSelectContext.Provider>
  )
}
