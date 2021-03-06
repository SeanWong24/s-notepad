import { alertController, popoverController } from '@ionic/core';
import { Component, ComponentInterface, h, Host, Prop, State } from '@stencil/core';
import { editor, languages } from 'monaco-editor';
import mousetrap from 'mousetrap';
import pako from 'pako';
import { applyTheme, getActualTheme } from '../../global/theme';
import '@seanwong24/s-monaco-editor';

@Component({
  tag: 'app-home',
  styleUrl: 'app-home.css',
  scoped: true,
})
export class AppHome implements ComponentInterface {

  private editorInstance: editor.IStandaloneCodeEditor;
  private isFileJustOpened: boolean = false;

  private _isAnyChangePending: boolean = false;
  private get isAnyChangePending() {
    return this._isAnyChangePending;
  }
  private set isAnyChangePending(value: boolean) {
    this._isAnyChangePending = value;
    this.updateAppTitle();
  }

  private _fileHandle: any;
  private get fileHandle() {
    return this._fileHandle;
  }
  private set fileHandle(value: any) {
    this._fileHandle = value;
    this.updateAppTitle();
  }

  private get baseUrl() {
    return window.location.origin.replace(window.location.hash, '');
  }

  @State() editorValue: string;
  @State() editorLanguages: languages.ILanguageExtensionPoint[];
  @State() editorTheme: string = getActualTheme() === 'light' ? 'vs-light' : 'vs-dark';
  @State() lineNumbersMinChars: number = 5;

  @Prop({ mutable: true }) editorLanguage: string = 'plaintext';
  @Prop() sharedContentBase64: string;


  connectedCallback() {
    applyTheme(getActualTheme());
  }

  componentDidLoad() {
    window.addEventListener('beforeunload', event => {
      if (this.isAnyChangePending) {
        const message = 'You have unsaved changes, are you really sure to close the document?';
        event.returnValue = message;
      }
    });

    if (this.sharedContentBase64) {
      const encodedBuffer = this.base64ToBuffer(this.sharedContentBase64.replace(/-/g, '/'));
      const inflatedBuffer = pako.inflate(encodedBuffer);
      this.editorValue = new TextDecoder('utf8').decode(inflatedBuffer);
    }
    if ('launchQueue' in window) {
      window['launchQueue'].setConsumer((launchParams) => {
        if (launchParams.files?.length > 0) {
          for (const fileHandle of launchParams.files) {
            this.openFile(fileHandle);
          }
        }
      });
    }


    this.addKeyboardShortcuts();
  }

  render() {
    return (
      <Host>
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button onClick={event => this.showFileMenu(event)}>
                <ion-icon name="document" slot="start"></ion-icon>
                <ion-label>File</ion-label>
              </ion-button>
              <ion-button onClick={event => this.showSettingMenu(event)}>
                <ion-icon name="settings" slot="start"></ion-icon>
                <ion-label>Settings</ion-label>
              </ion-button>
            </ion-buttons>
            {
              this.editorLanguages &&
              <ion-select
                slot="end"
                interface="popover"
                value={this.editorLanguage}
                placeholder="Content Format"
                onIonChange={({ detail }) => this.editorLanguage = detail.value}
              >
                {
                  this.editorLanguages?.map(language =>
                    <ion-select-option value={language.id}>{language.aliases[0]}</ion-select-option>
                  )
                }
              </ion-select>
            }
            <ion-buttons slot="end">
              <ion-button
                title="Embed a snapshot"
                onClick={() => this.embed()}
              >
                <ion-icon slot="icon-only" name="code-working"></ion-icon>
              </ion-button>
              <ion-button
                title="Share a snapshot"
                onClick={() => this.shareSnapshot()}
              >
                <ion-icon slot="icon-only" name="share"></ion-icon>
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>

        <ion-content scrollY={false}>
          <s-monaco-editor
            monaco-vs-path="./build/monaco-editor/vs"
            value={this.editorValue}
            language={this.editorLanguage}
            theme={this.editorTheme}
            lineNumbersMinChars={this.lineNumbersMinChars}
            onComponentLoad={({ detail }) => {
              this.editorInstance = detail.editor;
              this.editorLanguages = detail.monaco.languages.getLanguages();
            }}
            onDidChangeModelContent={event => {
              if (this.isFileJustOpened) {
                this.isFileJustOpened = false;
              } else {
                this.isAnyChangePending = true;
              }
              this.editorValue = (event.target as HTMLSMonacoEditorElement).value;
              const lineCountDigits = this.editorInstance.getModel().getLineCount().toString().length;
              this.lineNumbersMinChars = lineCountDigits >= 5 ? lineCountDigits + 1 : 5;
            }}
            onDragOver={event => event.preventDefault()}
            onDrop={async event => {
              event.preventDefault();
              for (const item of (event.dataTransfer.items as any)) {
                if (item.kind === 'file') {
                  const fileHandle = await item.getAsFileSystemHandle();
                  if (fileHandle.kind === 'file') {
                    await this.openFile(fileHandle);
                  } else {
                    const alert = await alertController.create({
                      header: 'Unsupported Type',
                      message: 'Opening a direcotory is not supported.',
                      buttons: ['OK']
                    });
                    await alert.present();
                  }
                }
              }
            }}
          ></s-monaco-editor>
        </ion-content>
      </Host >
    );
  }

  private async embed() {
    const alert = await alertController.create({
      header: 'Embed A Snapshot ',
      inputs: [
        {
          type: 'checkbox',
          label: 'Read Only',
          name: 'checkbox',
          value: 'readOnly'
        },
        {
          type: 'checkbox',
          label: 'Dark Theme',
          name: 'checkbox',
          value: 'darkTheme'
        }
      ],
      buttons: [
        'Cancel',
        {
          text: 'OK',
          handler: async value => {
            const checkboxCheckedItems = value as string[];

            const deflatedText = pako.deflate(new TextEncoder().encode(this.editorValue));
            const base64String = this.bufferToBase64(deflatedText).replace(/\//g, '-');
            let url = `${this.baseUrl}#/embed?`;
            if (checkboxCheckedItems.indexOf('readOnly') >= 0) {
              url += `readOnly=true&`;
            }
            if (checkboxCheckedItems.indexOf('darkTheme') >= 0) {
              url += `theme=vs-dark&`;
            }
            url += `language=${this.editorLanguage}&` +
              `value=${base64String}`;
            const resultAlert = await alertController.create({
              header: 'You can copy the code snippet and use it in your website.',
              inputs: [
                {
                  type: 'textarea',
                  value: `<iframe width="500px" height="500px" src="${url}"></iframe>`
                }
              ],
              buttons: ['OK']
            });
            await resultAlert.present();
          }
        }
      ]
    });
    await alert.present();
  }

  private async shareSnapshot() {
    const deflatedText = pako.deflate(new TextEncoder().encode(this.editorValue));
    const base64String = this.bufferToBase64(deflatedText).replace(/\//g, '-');
    const url = `${this.baseUrl}#/snapshot/${this.editorLanguage || 'plaintext'}/${base64String}`;
    if (navigator.share) {
      navigator.share({
        title: document.title,
        text: document.title,
        url
      });
    } else {
      const alert = await alertController.create({
        header: 'You can copy the link and share it.',
        inputs: [
          {
            type: 'text',
            value: url
          }
        ],
        buttons: ['OK']
      });
      await alert.present();
    }
  }

  private async showFileMenu(event: MouseEvent) {
    const popover = await popoverController.create({
      id: 'file-menu',
      component: 'app-file-menu',
      event: event,
      translucent: true,
      componentProps: {
        newFileHandler: () => this.createNew(),
        openFileHandler: () => this.openFile(),
        saveFileHandler: () => this.saveFile(),
        saveFileAsHandler: () => this.saveFile(true),
        exitHandler: () => this.exit()
      }
    });
    await popover.present();
  }

  private async showSettingMenu(event: MouseEvent) {
    const popover = await popoverController.create({
      id: 'setting-menu',
      component: 'app-setting-menu',
      event: event,
      translucent: true,
      componentProps: {
        updateEditorThemeHandler: theme => this.editorTheme = theme === 'light' ? 'vs-light' : 'vs-dark'
      }
    });
    await popover.present();
  }

  private async exit() {
    await this.alertIfAnyPendingChange(() => {
      window.close();
    });
  }

  private async createNew() {
    await this.alertIfAnyPendingChange(() => {
      this.fileHandle = undefined;
      this.editorValue = '';
      this.isAnyChangePending = false;
    });
  }

  private async saveFile(saveAs?: boolean) {
    if (!this.fileHandle || saveAs) {
      this.fileHandle = await (window as any).showSaveFilePicker({
        types: [
          {
            description: 'Text Files',
            accept: {
              'text/plain': ['.txt'],
            },
          },
        ],
      });
    }
    const writableStream = await this.fileHandle.createWritable();
    await writableStream.write(this.editorValue);
    await writableStream.close();
    this.isAnyChangePending = false;
  }

  private async openFile(fileHandle?: any) {
    await this.alertIfAnyPendingChange(async () => {
      this.fileHandle = fileHandle || (await (window as any).showOpenFilePicker())?.[0];
      const content = await this.readFile();
      this.loadContentToEditor(content);
      this.isAnyChangePending = false;
      this.isFileJustOpened = true;
    });
  }

  private async readFile() {
    const file = await this.fileHandle.getFile() as File;
    return await file.text();
  }

  private loadContentToEditor(content: string) {
    this.editorValue = content;
  }

  private async alertIfAnyPendingChange(continueHandler: () => void, cancelHandler?: () => void) {
    if (this.isAnyChangePending) {
      const alert = await alertController.create({
        header: 'You have unsaved changes',
        message: 'Do you really want to close current document without saving the changes?',
        buttons: [
          {
            text: 'No',
            handler: cancelHandler
          },
          {
            text: 'Yes',
            handler: continueHandler
          }
        ]
      });
      await alert.present();
    } else {
      continueHandler();
    }
  }

  private updateAppTitle() {
    if (this.fileHandle) {
      document.title = `${this.fileHandle.name}${this.isAnyChangePending ? '*' : ''} - SNotepad`;
    } else {
      document.title = `${this.isAnyChangePending ? '* - ' : ''}SNotepad`;
    }
  }

  private addKeyboardShortcuts() {
    const executeAction = (event: mousetrap.ExtendedKeyboardEvent, shortcutHandler: () => void) => {
      event.preventDefault();
      shortcutHandler();
    };

    mousetrap.bind(['ctrl+n', 'command+n'], event => executeAction(event, () => this.createNew()));
    mousetrap.bind(['ctrl+o', 'command+o'], event => executeAction(event, () => this.openFile()));
    mousetrap.bind(['ctrl+s', 'command+s'], event => executeAction(event, () => this.saveFile()));
    mousetrap.bind(['ctrl+shift+s', 'command+shift+s'], event => executeAction(event, () => this.saveFile(true)));

    mousetrap.prototype.stopCallback = () => false;
  }

  private bufferToBase64(buffer: Uint8Array) {
    var binstr = Array.prototype.map.call(buffer, function (character) {
      return String.fromCharCode(character);
    }).join('');
    return btoa(binstr);
  }

  private base64ToBuffer(base64: string) {
    var binstr = atob(base64);
    var buffer = new Uint8Array(binstr.length);
    Array.prototype.forEach.call(binstr, function (character, i) {
      buffer[i] = character.charCodeAt(0);
    });
    return buffer;
  }

}
