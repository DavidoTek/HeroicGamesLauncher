import {
  getAppSettings,
  getGameInfo,
  getInstallInfo,
  getProgress,
  install,
  writeConfig
} from 'src/helpers'
import React, { useContext, useEffect, useMemo, useState } from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFolderOpen, faXmark } from '@fortawesome/free-solid-svg-icons'
import { faWindows, faApple, faLinux } from '@fortawesome/free-brands-svg-icons'
import prettyBytes from 'pretty-bytes'
import { Checkbox } from '@mui/material'
import { IpcRenderer } from 'electron'

import './index.css'
import {
  AppSettings,
  GameStatus,
  InstallInfo,
  InstallProgress,
  Path,
  Runner
} from 'src/types'

import { UpdateComponent, SvgButton } from 'src/components/UI'
import { useTranslation } from 'react-i18next'
import ContextProvider from 'src/state/ContextProvider'

import { SDL_GAMES, SelectiveDownload } from './selective_dl'

const { ipcRenderer } = window.require('electron') as {
  ipcRenderer: IpcRenderer
}

type Props = {
  appName: string
  backdropClick: () => void
  runner: Runner
}

const storage: Storage = window.localStorage

function getInstallLanguage(
  availableLanguages: string[],
  preferredLanguages: readonly string[]
) {
  const foundPreffered = preferredLanguages.find((plang) =>
    availableLanguages.some((alang) => alang.startsWith(plang))
  )
  if (foundPreffered) {
    const foundAvailable = availableLanguages.find((alang) =>
      alang.startsWith(foundPreffered)
    )
    if (foundAvailable) {
      return foundAvailable
    }
  }
  return availableLanguages[0]
}

export default function InstallModal({
  appName,
  backdropClick,
  runner
}: Props) {
  const previousProgress = JSON.parse(
    storage.getItem(appName) || '{}'
  ) as InstallProgress

  const { i18n } = useTranslation()
  const { libraryStatus, handleGameStatus, platform } =
    useContext(ContextProvider)
  const gameStatus: GameStatus = libraryStatus.filter(
    (game: GameStatus) => game.appName === appName
  )[0]
  const [gameInfo, setGameInfo] = useState({} as InstallInfo)
  const [installDlcs, setInstallDlcs] = useState(false)
  const [winePrefix, setWinePrefix] = useState('...')
  const [defaultPath, setDefaultPath] = useState('...')
  const [installPath, setInstallPath] = useState(
    previousProgress.folder || 'default'
  )
  const [installLanguages, setInstallLanguages] = useState(Array<string>())
  const [installLanguage, setInstallLanguage] = useState('')

  const installFolder = gameStatus?.folder || installPath

  const isMac = platform === 'darwin'
  const isLinux = platform === 'linux'

  const [isLinuxNative, setIsLinuxNative] = useState(false)
  const [isMacNative, setIsMacNative] = useState(false)

  // TODO: Refactor
  const haveSDL = Boolean(SDL_GAMES[appName])
  const mandatoryTags: Array<string> = []
  if (SDL_GAMES[appName]) {
    const tags: Array<string | string[]> = SDL_GAMES[appName]
      .filter((el: SelectiveDownload) => el.mandatory)
      .map((el: SelectiveDownload) => el.tags)
    tags.forEach((tag) => {
      if (typeof tag === 'object') {
        tag.forEach((t) => mandatoryTags.push(t))
      } else if (typeof tag === 'string') {
        mandatoryTags.push(tag)
      }
      return
    })
  }
  const [sdlList, setSdlList] = useState([...mandatoryTags])
  const { t } = useTranslation('gamepage')

  async function handleInstall(path?: string) {
    backdropClick()

    // Write Default game config with prefix on linux
    if (isLinux) {
      const appSettings: AppSettings = await ipcRenderer.invoke(
        'requestSettings',
        appName
      )

      writeConfig([appName, { ...appSettings, winePrefix }])
    }

    return await install({
      appName,
      handleGameStatus,
      installPath: path || installFolder,
      isInstalling: false,
      previousProgress,
      progress: previousProgress,
      t,
      sdlList,
      installDlcs,
      installLanguage,
      runner
    })
  }

  useEffect(() => {
    ipcRenderer
      .invoke('requestSettings', 'default')
      .then((config: AppSettings) => {
        setDefaultPath(config.defaultInstallPath)
        if (installPath === 'default') {
          setInstallPath(config.defaultInstallPath)
        }
      })
    return () => {
      ipcRenderer.removeAllListeners('requestSettings')
    }
  }, [appName, installPath])

  function handleSdl(tags: Array<string>) {
    let updatedList: Array<string> = [...sdlList]
    tags.forEach((tag) => {
      if (updatedList.includes(tag)) {
        return (updatedList = updatedList.filter((tagx) => {
          return tagx !== tag
        }))
      }
      return updatedList.push(tag)
    })
    setSdlList([...updatedList])
  }

  function handleDlcs() {
    setInstallDlcs(!installDlcs)
  }

  useEffect(() => {
    const getInfo = async () => {
      const gameInfo = await getInstallInfo(appName, runner)
      const gameData = await getGameInfo(appName, runner)
      setGameInfo(gameInfo)
      if (gameInfo.manifest?.languages) {
        setInstallLanguages(gameInfo.manifest.languages)
        setInstallLanguage(
          getInstallLanguage(gameInfo.manifest.languages, i18n.languages)
        )
      }
      setIsLinuxNative(gameData.is_linux_native && isLinux)
      setIsMacNative(gameData.is_mac_native && isMac)
      if (isLinux && gameData.is_linux_native && runner == 'gog') {
        const installer_languages = (await ipcRenderer.invoke(
          'getGOGLinuxInstallersLangs',
          appName
        )) as string[]
        setInstallLanguages(installer_languages)
        setInstallLanguage(
          getInstallLanguage(installer_languages, i18n.languages)
        )
      }
      const regexp = new RegExp(/[:|/|*|?|<|>|\\|&|{|}|%|$|@|`|!|™|+|']/, 'gi')
      const fixedTitle = gameInfo.game.title
        .replaceAll(regexp, '')
        .replaceAll(' ', '-')
      const { defaultWinePrefix } = await getAppSettings()
      const sugestedWinePrefix = `${defaultWinePrefix}/${fixedTitle}`
      setWinePrefix(sugestedWinePrefix)
    }
    getInfo()
  }, [appName, i18n.languages])

  const haveDLCs = gameInfo?.game?.owned_dlc?.length > 0
  const DLCList = gameInfo?.game?.owned_dlc
  const downloadSize =
    gameInfo?.manifest?.download_size &&
    prettyBytes(Number(gameInfo?.manifest?.download_size))
  const installSize =
    gameInfo?.manifest?.disk_size &&
    prettyBytes(Number(gameInfo?.manifest?.disk_size))

  function getDownloadedProgress() {
    if (previousProgress.folder === installPath) {
      const currentStatus = `${getProgress(previousProgress)}%`
      return (
        <span className="smallMessage">{`${t(
          'status.totalDownloaded',
          'Total Downloaded'
        )} ${currentStatus}`}</span>
      )
    }
    return null
  }

  function getIcon() {
    if (isMacNative) {
      return faApple
    } else if (isLinuxNative) {
      return faLinux
    } else {
      return faWindows
    }
  }

  const getLanguageName = useMemo(() => {
    return (language: string) => {
      try {
        const locale = language.replace('_', '-')
        const displayNames = new Intl.DisplayNames(
          [locale, ...i18n.languages, 'en'],
          {
            type: 'language',
            style: 'long'
          }
        )
        return displayNames.of(locale)
      } catch (e) {
        return language
      }
    }
  }, [i18n.language])

  return (
    <span className="modalContainer">
      {gameInfo?.game?.title ? (
        <div className="modal">
          <SvgButton className="close-button" onClick={() => backdropClick()}>
            <FontAwesomeIcon icon={faXmark} />
          </SvgButton>
          <span className="title">
            {gameInfo?.game?.title}
            <FontAwesomeIcon icon={getIcon()} />
          </span>
          <div className="installInfo">
            <div className="itemContainer">
              <span className="item">
                <span className="sizeInfo">
                  {t('game.downloadSize', 'Download Size')}:
                </span>{' '}
                <span>{downloadSize}</span>
              </span>
              <span className="item">
                <span className="sizeInfo">
                  {t('game.installSize', 'Install Size')}:
                </span>{' '}
                <span>{installSize}</span>
              </span>
            </div>
            {installLanguages && installLanguages?.length > 1 && (
              <div className="languageOptions">
                <span className="languageInfo">
                  {t('game.language', 'Language')}:
                </span>
                <select
                  name="language"
                  id="languagePick"
                  value={installLanguage}
                  onChange={(e) => setInstallLanguage(e.target.value)}
                >
                  {installLanguages &&
                    installLanguages.map((value) => (
                      <option value={value} key={value}>
                        {getLanguageName(value)}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <span className="installPath">
              <span className="settingText">
                {t('install.path', 'Select Install Path')}:
              </span>
              <span>
                <input
                  data-testid="setinstallpath"
                  type="text"
                  value={installPath.replaceAll("'", '')}
                  className="settingSelect"
                  placeholder={defaultPath}
                  onChange={(event) => setInstallPath(event.target.value)}
                />
                <SvgButton
                  onClick={() =>
                    ipcRenderer
                      .invoke('openDialog', {
                        buttonLabel: t('box.choose'),
                        properties: ['openDirectory'],
                        title: t('install.path')
                      })
                      .then(({ path }: Path) =>
                        setInstallPath(path ? path : defaultPath)
                      )
                  }
                >
                  <FontAwesomeIcon
                    className="fontAwesome folder"
                    icon={faFolderOpen}
                  />
                </SvgButton>
              </span>
              {getDownloadedProgress()}
            </span>
            {isLinux && !isLinuxNative && (
              <span className="installPath">
                <span className="settingText">
                  {t('install.wineprefix', 'WinePrefix')}:
                </span>
                <span>
                  <input
                    type="text"
                    value={winePrefix.replaceAll("'", '')}
                    className="settingSelect"
                    placeholder={winePrefix}
                    onChange={(event) => setWinePrefix(event.target.value)}
                  />
                  <SvgButton
                    onClick={() =>
                      ipcRenderer
                        .invoke('openDialog', {
                          buttonLabel: t('box.choose'),
                          properties: ['openDirectory'],
                          title: t('box.wineprefix', 'Select WinePrefix Folder')
                        })
                        .then(({ path }: Path) =>
                          setWinePrefix(path ? path : winePrefix)
                        )
                    }
                  >
                    <FontAwesomeIcon
                      className="fontAwesome folder"
                      icon={faFolderOpen}
                    />
                  </SvgButton>
                </span>
                {getDownloadedProgress()}
              </span>
            )}
            {haveDLCs && (
              <div className="itemContainer">
                <div className="itemTitle">{t('dlc.title', 'DLCs')}</div>
                <div className="dlcList">
                  {DLCList.map(({ app_name, title }) => (
                    <span key={app_name} className="itemName">
                      {title}
                    </span>
                  ))}
                </div>
                <span className="item">
                  <Checkbox
                    color="primary"
                    checked={installDlcs}
                    size="small"
                    onChange={() => handleDlcs()}
                  />
                  <span>{t('dlc.installDlcs', 'Install all DLCs')}</span>
                </span>
              </div>
            )}
            {haveSDL && (
              <div className="itemContainer">
                <p className="itemTitle">
                  {t('sdl.title', 'Select components to Install')}
                </p>
                {SDL_GAMES[appName].map(
                  ({ name, tags, mandatory }: SelectiveDownload) =>
                    !mandatory && (
                      <span key={name} className="item">
                        <Checkbox
                          color="primary"
                          checked={mandatory}
                          disabled={mandatory}
                          size="small"
                          onChange={() => handleSdl(tags)}
                        />
                        <span>{name}</span>
                      </span>
                    )
                )}
              </div>
            )}
          </div>
          <div className="buttonsContainer">
            <button
              onClick={() => handleInstall('import')}
              className={`button is-secondary outline`}
            >
              {t('button.import')}
            </button>
            <button
              onClick={() => handleInstall()}
              className={`button is-secondary`}
            >
              {getDownloadedProgress()
                ? t('button.continue', 'Continue Download')
                : t('button.install')}
            </button>
          </div>
        </div>
      ) : (
        <UpdateComponent />
      )}
      <span className="backdrop" onClick={() => backdropClick()} />
    </span>
  )
}
