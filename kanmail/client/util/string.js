import moment from 'moment';


export function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}


export function lowercaseFirstLetter(string) {
    return string.charAt(0).toLowerCase() + string.slice(1);
}


export function formatDate(date) {
    return moment(date).calendar(null, {sameElse: 'DD/MM/YYYY'});
}


export function formatAddress(address) {
    return address[0] ? address[0] : address[1];
}
