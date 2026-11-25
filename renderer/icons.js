const icon = (() => {
  const glyphs = {
    add: 0xf103,
    'add-circle-outline': 0xf105,
    'arrow-down-circle-outline': 0xf12f,
    'checkmark-circle-outline': 0xf21f,
    'checkmark-done-outline': 0xf225,
    'chevron-back': 0xf229,
    'chevron-down': 0xf232,
    'chevron-forward': 0xf23b,
    close: 0xf24a,
    'copy-outline': 0xf290,
    'document-text-outline': 0xf2b4,
    'help-circle-outline': 0xf37e,
    'information-circle-outline': 0xf399,
    'leaf-outline': 0xf3b3,
    'pencil-outline': 0xf49d,
    'reader-outline': 0xf50c,
    'remove-circle-outline': 0xf522,
    'send-outline': 0xf566,
    'settings-outline': 0xf56c
  }
  return (name) =>
    `<span class="icon" aria-hidden="true" data-glyph="&#${glyphs[name]};"></span>`
})()
