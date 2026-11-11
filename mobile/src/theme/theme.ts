import { MD3DarkTheme as DarkTheme, DefaultTheme } from 'react-native-paper'

// Amber/gold theme matching the web app
export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#b45309',
    accent: '#ea580c',
    background: '#fffbeb',
    surface: '#ffffff',
    text: '#1c1917',
  },
}

export const darkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#f59e0b',
    accent: '#fb923c',
    background: '#1c1917',
  },
}
