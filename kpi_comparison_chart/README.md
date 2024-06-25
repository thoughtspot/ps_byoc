<p align="center">
    <img src="https://raw.githubusercontent.com/thoughtspot/visual-embed-sdk/main/static/doc-images/images/TS-Logo-black-no-bg.svg" width=120 align="center" alt="ThoughtSpot" />
</p>

<br/>

# ThoughtSpot Charts SDK <br/>

ThoughtSpot Charts SDK allows developers to integrate custom charts into ThoughtSpot. Developers can create custom charts in Javascript using charting libraries such as HighCharts and upload them to ThoughtSpot.   


# Get started
This tutorial demonstrates how to create a Gantt chart using HighCharts. 
<insert links and fiddle links above>
* [Highchart demo link](https://www.highcharts.com/demo/gantt/progress-indicator)
* [JSFiddle link](https://jsfiddle.net/gh/get/library/pure/highcharts/highcharts/tree/master/samples/gantt/demo/progress-indicator)

## Prerequisites
Before you begin, check for the following requirements:

* Access to a ThoughtSpot Cloud application instance
* A Development Environment (IDE) for building custom charts
* Working knowledge of JavaScript or Typescript
* Familiarity with charting libraries such as Highcharts
* Knowledge of the chart type

## Set up your environment
To create and test the application, this tutorial uses a Vite project setup.

### Create a new Vite project

1. Open a terminal window and run the following commands:

     ```bash
     md gantt
     cd gantt
     ```

2. Create a Vite project.
     ```bash
     $ npm create vite@latest
     ```
3. Configure the project name and development framework for your chart application. In this tutorial, we will use the Vanilla framework with Javascript.
