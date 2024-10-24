import Highcharts from 'highcharts';


// Define the data for the chart
const data = {
    categories: ['Apples', 'Oranges', 'Pears', 'Grapes', 'Bananas'],
    series: [
        {
            name: 'John',
            data: [5, 3, 4, 7, 2]
        },
        {
            name: 'Jane',
            data: [2, 2, 3, 2, 1]
        },
        {
            name: 'Joe',
            data: [3, 4, 4, 2, 5]
        }
    ]
};

// Create the stacked bar chart
document.addEventListener('DOMContentLoaded', function () {
    Highcharts.chart('chart-container', {
        chart: {
            type: 'bar'
        },
        title: {
            text: 'Stacked Bar Chart Example'
        },
        xAxis: {
            categories: data.categories
        },
        yAxis: {
            min: 0,
            title: {
                text: 'Total fruit consumption'
            }
        },
        legend: {
            reversed: true
        },
        plotOptions: {
            series: {
                stacking: 'normal' // This enables stacking
            }
        },
        series: data.series
    });
});
