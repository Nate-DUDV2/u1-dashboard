module.exports = {
    packagerConfig: {
      asar: true,
      name: 'Snapmaker U1 Dashboard',
      // Looks for icon.ico on Windows, icon.icns on Mac, icon.png on Linux automatically
      icon: './public/icon' 
    },
    rebuildConfig: {},
    makers: [
      // 🪟 WINDOWS BUILD
      {
        name: '@electron-forge/maker-squirrel',
        config: {
          name: 'gantry_gourmet',
          setupExe: 'Snapmaker U1 Dashboard-Windows-Setup.exe'
        },
      },
      // 🍏 MAC BUILDS (.zip and drag-and-drop .dmg)
      {
        name: '@electron-forge/maker-zip',
        platforms: ['darwin'],
      },
      {
        name: '@electron-forge/maker-dmg',
        config: {
          name: 'Snapmaker U1 Dashboard',
          overwrite: true
        }
      },
      // 🐧 LINUX BUILDS (.deb for Ubuntu/Debian, .rpm for Fedora/RedHat)
      {
        name: '@electron-forge/maker-deb',
        config: {
          options: {
            section: 'utils',
            productName: 'Snapmaker U1 Dashboard'
          }
        },
      },
      {
        name: '@electron-forge/maker-rpm',
        config: {},
      },
    ],
  };