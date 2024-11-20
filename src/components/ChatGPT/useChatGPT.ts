import { useEffect, useReducer, useRef, useState } from 'react'

import ClipboardJS from 'clipboard'
import { throttle } from 'lodash-es'

import { ChatGPTProps, ChatMessage, ChatRole } from './interface'
import { Console } from 'console'

const scrollDown = throttle(
  () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  },
  300,
  {
    leading: true,
    trailing: false
  }
)

const requestMessage = async (
  url: string,
  messages: ChatMessage[],
  controller: AbortController | null,
  chat_id: string,
  starting_message_id: string
) => {
  
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      messages,
      chat_id,
      starting_message_id
    }),
    signal: controller?.signal
  })

  if (!response.ok) {
    throw new Error(response.statusText)
  }
  const data = response.body

  if (!data) {
    throw new Error('No data')
  }
  
  return data.getReader()
}

export const useChatGPT = (props: ChatGPTProps) => {
  const { fetchPath } = props
  const [, forceUpdate] = useReducer((x) => !x, false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [disabled] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)

  const controller = useRef<AbortController | null>(null)
  const currentMessage = useRef<string>('')

  const archiveCurrentMessage = (current_role = ChatRole.System) => {
    const content = currentMessage.current
    currentMessage.current = ''
    setLoading(false)
    if (content) {
      setMessages((messages) => {
        return [
          ...messages,
          {
            content,
            role: current_role
          }
        ]
      })
      scrollDown()
    }
  }

  const fetchMessage = async (messages: ChatMessage[]) => {
    
    try {
      let chat_id = ""
      let starting_message_id = ""
      controller.current = new AbortController()
      setLoading(true)
      let send_next = true
      let loop_count = 0
      let sleep_time = 500

      do {
        
        currentMessage.current = ''
        const reader = await requestMessage(fetchPath, messages, controller.current, chat_id, starting_message_id)
        const decoder = new TextDecoder('utf-8')
        let done = false
  
        while (!done) {
          const { value, done: readerDone } = await reader.read()
          if (value) {
            const char = decoder.decode(value)
            if (char === '\n' && currentMessage.current.endsWith('\n')) {
              continue
            }
            if (char) {
              currentMessage.current += char
              // forceUpdate()
            }
            // scrollDown()
          }
          done = readerDone
        }
        if (chat_id === "") {
          const json = JSON.parse(currentMessage.current)
          chat_id = json['chatId']
          
        }else{
          
          let json = JSON.parse(currentMessage.current)
          
          let mymessages = json['messages']
        
          console.log("mymessages: ", mymessages)
          for (let i = 0; i < mymessages.length; i++) {
            let m = mymessages[i]
            
            if (m.role === "System") {
              
              currentMessage.current = m['content']
              
              archiveCurrentMessage(ChatRole.System)

              if (i === mymessages.length - 1) {
                starting_message_id = m['messageId']    
              }
              
            }else if(m.role === "Assistant" && !m['isCompleted']){
              currentMessage.current = m['content']
              forceUpdate()
            }
            else if(m.role === "Assistant" && m['isCompleted']){
              currentMessage.current = m['content']
              forceUpdate()
              archiveCurrentMessage(ChatRole.Assistant)
              console.log(m['content'])
              send_next = false
            }
            
          }
          
        }
        // sleep 0.5s
        await new Promise((resolve) => setTimeout(resolve, sleep_time))
        loop_count += 1
        console.log("loop_count: ", loop_count, "sleep_time: ", sleep_time)
      } while(send_next && loop_count < 200)
    } catch (e) {
      console.error(e)
      setLoading(false)
      return
    }
  }

  const onStop = () => {
    
    if (controller.current) {
      controller.current.abort()
      archiveCurrentMessage()
    }
  }

  const onSend = (message: ChatMessage) => {
    
    const newMessages = [...messages, message]
    
    setMessages(newMessages)
    
    fetchMessage(newMessages)
  }

  const onClear = () => {
    setMessages([])
  }

  useEffect(() => {
    new ClipboardJS('.chat-wrapper .copy-btn')
  }, [])

  return {
    loading,
    disabled,
    messages,
    currentMessage,
    onSend,
    onClear,
    onStop
  }
}
