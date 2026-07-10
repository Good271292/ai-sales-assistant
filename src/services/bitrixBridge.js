function getOwnerTypeId(entityType) {
    if (entityType === 'lead') return 1
    if (entityType === 'deal') return 2
    if (entityType === 'contact') return 3
    if (entityType === 'company') return 4
  
    throw new Error(`Unsupported entityType: ${entityType}`)
  }
  
  export async function saveCallResultToBitrix(callResult) {
    if (!window.BX24) {
      console.log('Mock save to Bitrix24:', callResult)
  
      return {
        success: true,
        activityId: 'mock-activity-001',
        message: 'Результат звонка подготовлен для записи в Bitrix24',
      }
    }
  
    return new Promise((resolve, reject) => {
      const ownerTypeId = getOwnerTypeId(callResult.entityType)
  
      window.BX24.callMethod(
        'crm.timeline.comment.add',
        {
          fields: {
            ENTITY_ID: callResult.entityId,
            ENTITY_TYPE_ID: ownerTypeId,
            COMMENT: callResult.summaryText,
          },
        },
        function (result) {
          if (result.error()) {
            reject(new Error(result.error_description()))
            return
          }
  
          resolve({
            success: true,
            activityId: result.data(),
            message: 'Результат звонка записан в таймлайн Bitrix24',
          })
        }
      )
    })
  }