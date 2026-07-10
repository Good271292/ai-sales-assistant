export function registerCallCardPlacement() {
    if (!window.BX24) {
      return Promise.reject(new Error('BX24 SDK недоступен'))
    }
  
    const handlerUrl = `${window.location.origin}${window.location.pathname}`
  
    return new Promise((resolve, reject) => {
      window.BX24.callMethod(
        'placement.bind',
        {
          PLACEMENT: 'CALL_CARD',
          HANDLER: handlerUrl,
          TITLE: 'AI Sales Assistant',
        },
        function (result) {
          if (result.error()) {
            reject(new Error(result.error_description()))
            return
          }
  
          resolve({
            success: true,
            data: result.data(),
            handlerUrl,
          })
        }
      )
    })
  }