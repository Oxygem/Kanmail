const messagesContainer = document.querySelector('#messages');


export function addMessage(message, type='info') {
    const newMessage = document.createElement('div');
    newMessage.classList.add(type);
    newMessage.textContent = message;

    messagesContainer.appendChild(newMessage);
    return newMessage;
}


export function deleteMessage(message) {
    messagesContainer.removeChild(message);
}
