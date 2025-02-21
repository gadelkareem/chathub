import { requestHostPermission } from '~app/utils/permissions'
import { ClaudeAPIModel, UserConfig } from '~services/user-config'
import { ChatError, ErrorCode } from '~utils/errors'
import { parseSSEResponse } from '~utils/sse'
import { AbstractBot, SendMessageParams } from '../abstract-bot'

interface ConversationContext {
  prompt: string
}

export class ClaudeApiBot extends AbstractBot {
  private conversationContext?: ConversationContext

  constructor(private config: Pick<UserConfig, 'claudeApiKey' | 'claudeApiModel'>) {
    super()
  }

  async fetchCompletionApi(prompt: string, signal?: AbortSignal) {
    const isMessagesAPI = this.config.claudeApiModel === ClaudeAPIModel['claude-3']
    const endpoint = isMessagesAPI ? 'https://api.anthropic.com/v1/messages' : 'https://api.anthropic.com/v1/complete'
    
    const headers = {
      'content-type': 'application/json',
      'x-api-key': this.config.claudeApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }

    const body = isMessagesAPI ? {
      model: this.getModelName(),
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 8192,
    } : {
      prompt,
      model: this.getModelName(),
      max_tokens_to_sample: 100_000,
      stream: true,
    }

    return fetch(endpoint, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify(body),
    })
  }

  async doSendMessage(params: SendMessageParams) {
    // if (!(await requestHostPermission('https://*.anthropic.com/'))) {
    //   throw new ChatError('Missing anthropic.com permission', ErrorCode.UNKOWN_ERROR)
    // }

    if (!this.conversationContext) {
      this.conversationContext = { prompt: '' }
    }

    const isMessagesAPI = this.config.claudeApiModel === ClaudeAPIModel['claude-3']
    const prompt = isMessagesAPI ? params.prompt : `${this.conversationContext.prompt}\n\nHuman: ${params.prompt}\n\nAssistant:`

    const resp = await this.fetchCompletionApi(prompt, params.signal)
    let result = ''

    await parseSSEResponse(resp, (message) => {
      console.debug('claude sse message', message)
      const data = JSON.parse(message)
      const content = isMessagesAPI ? data.delta?.text : data.completion
      if (content) {
        result += content
        params.onEvent({ type: 'UPDATE_ANSWER', data: { text: result.trimStart() } })
      }
    })

    params.onEvent({ type: 'DONE' })
    if (!isMessagesAPI) {
      this.conversationContext!.prompt += result
    }
  }

  private getModelName() {
    switch (this.config.claudeApiModel) {
      case ClaudeAPIModel['claude-instant-1']:
        return 'claude-instant-1.2'
      default:
        return 'claude-3-5-sonnet-latest'
    }
  }

  resetConversation() {
    this.conversationContext = undefined
  }

  get name() {
    return `Claude (API/${this.config.claudeApiModel})`
  }
}
