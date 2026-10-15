# Records docs/demo.gif and docs/demo.mp4 against real Docker.
# Run from the repo root: npm run build && vhs docs/demo.tape
Output docs/demo.gif
Output docs/demo.mp4

Set Shell "bash"
Set FontSize 18
Set Width 1500
Set Height 600
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set WindowBar Colorful
Set WaitTimeout 90s

Source docs/demo-steps.tape
